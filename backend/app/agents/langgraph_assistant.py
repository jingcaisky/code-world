import logging
from typing import Annotated, Any, Literal, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.graph.state import CompiledStateGraph
from langgraph.managed import RemainingSteps
from langgraph.prebuilt import ToolNode

from app.agents.prompts import get_system_prompt_with_rag
from app.agents.tools.rag_tool import _active_kb_collections, search_knowledge_base
from app.agents.tools.web_search import web_search
from app.agents.utils import get_current_datetime
from app.core.config import settings

logger = logging.getLogger(__name__)


class AgentContext(TypedDict, total=False):
    """Runtime context passed via config to the graph."""

    user_id: str | None
    user_name: str | None
    # Resolved server-side from conversation.active_knowledge_base_ids — never from the LLM
    kb_collection_names: list[str]
    metadata: dict[str, Any]


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    remaining_steps: RemainingSteps


@tool
def current_datetime() -> dict[str, str]:
    """Get the current date and time.

    Use this tool when you need to know the current date or time.
    """
    return get_current_datetime()


@tool
async def web_search_tool(query: str, max_results: int = 5) -> str:
    """Search the web for current information.

    Use this tool to find up-to-date information about events, facts, or topics
    that may not be in the model's training data.

    Args:
        query: The search query string.
        max_results: Maximum number of results to return (1-10, default: 5).

    Returns:
        Formatted string with search results including titles, URLs, and content.
    """
    return await web_search(query, max_results)


@tool
async def search_documents(query: str, top_k: int = 5) -> str:
    """Search the knowledge base for relevant documents.

    Use this tool to find information from uploaded documents before answering user queries.
    Searches across all knowledge bases active for this conversation.
    Cite sources by referring to the document filename from the search results.

    Args:
        query: The search query string.
        top_k: Number of top results to retrieve (default: 5).

    Returns:
        Formatted string with search results including content and scores.
    """
    return await search_knowledge_base(query=query, top_k=top_k)


ALL_TOOLS = [current_datetime]
ALL_TOOLS.append(web_search_tool)
ALL_TOOLS.append(search_documents)


class LangGraphAssistant:
    def __init__(
        self,
        model_name: str | None = None,
        temperature: float | None = None,
        system_prompt: str | None = None,
        thinking_effort: str | None = None,
    ):
        self.model_name = model_name or settings.AI_MODEL
        self.temperature = temperature or settings.AI_TEMPERATURE
        # Extended-thinking effort for reasoning-capable models (Claude
        # extended thinking, OpenAI o-series). ``None`` keeps the model in
        # plain mode.
        self.thinking_effort = (
            thinking_effort
            if thinking_effort is not None
            else (settings.AI_THINKING_EFFORT if settings.AI_THINKING_ENABLED else None)
        )
        self.system_prompt = system_prompt or get_system_prompt_with_rag()
        self._model = self._create_model()
        self._graph = None
        self._checkpointer = MemorySaver()

    def _create_model(self) -> BaseChatModel:
        lowered = self.model_name.lower()
        if lowered.startswith(("claude-", "claude/")):
            anthropic_kwargs: dict[str, Any] = {}
            if self.thinking_effort:
                budget = {"low": 1024, "medium": 4096, "high": 16384}.get(
                    self.thinking_effort, 4096
                )
                anthropic_kwargs["thinking"] = {"type": "enabled", "budget_tokens": budget}
                anthropic_kwargs["max_tokens"] = budget + 4096
                anthropic_kwargs["temperature"] = 1.0
            model = ChatAnthropic(
                model=self.model_name,
                temperature=anthropic_kwargs.pop("temperature", self.temperature),
                api_key=settings.ANTHROPIC_API_KEY,
                **anthropic_kwargs,
            )
        elif lowered.startswith("gemini"):
            model = ChatGoogleGenerativeAI(
                model=self.model_name,
                temperature=self.temperature,
                google_api_key=settings.GOOGLE_API_KEY,
            )
        else:
            openai_kwargs: dict[str, Any] = {}
            if self.thinking_effort:
                openai_kwargs["reasoning"] = {"effort": self.thinking_effort, "summary": "auto"}
                openai_kwargs["use_responses_api"] = True
                openai_kwargs["output_version"] = "responses/v1"
            model = ChatOpenAI(
                model=self.model_name,
                temperature=self.temperature,
                api_key=settings.OPENAI_API_KEY,
                **openai_kwargs,
            )

        return model.bind_tools(ALL_TOOLS)

    async def _agent_node(self, state: AgentState) -> dict[str, list[AnyMessage]]:
        if state.get("remaining_steps", 10) <= 2:
            return {
                "messages": [
                    AIMessage(
                        content="I've reached my step limit and cannot continue reasoning. Here is what I found so far."
                    )
                ]
            }

        messages = [SystemMessage(content=self.system_prompt), *state["messages"]]

        response = await self._model.ainvoke(messages)

        logger.info(
            "Agent processed message - Tool calls: %d",
            len(response.tool_calls) if hasattr(response, "tool_calls") else 0,
        )

        return {"messages": [response]}

    def _should_continue(self, state: AgentState) -> Literal["tools", "__end__"]:
        messages = state["messages"]
        last_message = messages[-1]

        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            logger.info("Continuing to tools - %d tool(s) to execute", len(last_message.tool_calls))
            return "tools"

        logger.info("No tool calls - ending conversation")
        return "__end__"

    def _build_graph(self) -> CompiledStateGraph:
        workflow = StateGraph(AgentState)

        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", ToolNode(ALL_TOOLS))

        workflow.add_edge(START, "agent")
        workflow.add_conditional_edges(
            "agent",
            self._should_continue,
            {"tools": "tools", "__end__": END},
        )
        workflow.add_edge("tools", "agent")

        return workflow.compile(checkpointer=self._checkpointer)

    @property
    def graph(self) -> CompiledStateGraph:
        if self._graph is None:
            self._graph = self._build_graph()
        return self._graph

    @staticmethod
    def _convert_history(
        history: list[dict[str, str]] | None,
    ) -> list[HumanMessage | AIMessage | SystemMessage]:
        messages: list[HumanMessage | AIMessage | SystemMessage] = []

        for msg in history or []:
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                messages.append(AIMessage(content=msg["content"]))
            elif msg["role"] == "system":
                messages.append(SystemMessage(content=msg["content"]))

        return messages

    async def run(
        self,
        user_input: str,
        history: list[dict[str, str]] | None = None,
        context: AgentContext | None = None,
        thread_id: str = "default",
    ) -> tuple[str, list[Any], AgentContext]:
        messages = self._convert_history(history)
        messages.append(HumanMessage(content=user_input))

        agent_context: AgentContext = context if context is not None else {}

        logger.info("Running agent with user input: %s...", user_input[:100])

        config = {
            "configurable": {
                "thread_id": thread_id,
                **agent_context,
            }
        }
        token = _active_kb_collections.set(agent_context.get("kb_collection_names") or [])
        try:
            result = await self.graph.ainvoke({"messages": messages}, config=config)
        finally:
            _active_kb_collections.reset(token)

        output = ""
        tool_events: list[Any] = []

        for message in result.get("messages", []):
            if isinstance(message, AIMessage):
                if message.content:
                    output = (
                        message.content
                        if isinstance(message.content, str)
                        else str(message.content)
                    )
                if hasattr(message, "tool_calls") and message.tool_calls:
                    tool_events.extend(message.tool_calls)

        logger.info("Agent run complete. Output length: %d chars", len(output))

        return output, tool_events, agent_context

    async def stream(
        self,
        user_input: str,
        history: list[dict[str, str]] | None = None,
        context: AgentContext | None = None,
        thread_id: str = "default",
    ):
        messages = self._convert_history(history)
        messages.append(HumanMessage(content=user_input))

        agent_context: AgentContext = context if context is not None else {}

        config = {
            "configurable": {
                "thread_id": thread_id,
                **agent_context,
            }
        }

        logger.info("Starting stream for user input: %s...", user_input[:100])
        token = _active_kb_collections.set(agent_context.get("kb_collection_names") or [])
        try:
            async for stream_mode, data in self.graph.astream(
                {"messages": messages},
                config=config,
                stream_mode=["messages", "updates"],
            ):
                yield stream_mode, data
        finally:
            _active_kb_collections.reset(token)


def get_agent(
    model_name: str | None = None,
    thinking_effort: str | None = None,
) -> LangGraphAssistant:
    return LangGraphAssistant(model_name=model_name, thinking_effort=thinking_effort)


async def run_agent(
    user_input: str,
    history: list[dict[str, str]],
    context: AgentContext | None = None,
    thread_id: str = "default",
) -> tuple[str, list[Any], AgentContext]:
    agent = get_agent()
    return await agent.run(user_input, history, context, thread_id)
