/**
 * App launcher modal — renders another agent-native app's UI in an iframe
 * dialog when the agent calls the launch-app action.
 */

import { readAppState, writeAppState } from "@agent-native/core/application-state";
import { IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_LAUNCHER_POLL_INTERVAL_MS } from "../../config/const.js";

interface LaunchAppState {
  appId?: string;
  url?: string;
  open?: boolean;
}

/** Dev-mode default URLs for first-party apps. Override by passing a URL to launch-app. */
const DEFAULT_APP_URLS: Record<string, string> = {
  mail: "http://localhost:8085",
  calendar: "http://localhost:8082",
  content: "http://localhost:8083",
  forms: "http://localhost:8084",
  slides: "http://localhost:8086",
  videos: "http://localhost:8087",
  analytics: "http://localhost:8088",
  chat: "http://localhost:8089",
  dispatch: "http://localhost:8092",
  macros: "http://localhost:8093",
  clips: "http://localhost:8094",
  design: "http://localhost:8099",
  assets: "http://localhost:8100",
  brain: "http://localhost:8102",
  plan: "http://localhost:8105",
};

const APP_NAMES: Record<string, string> = {
  mail: "邮箱",
  calendar: "日历",
  content: "内容",
  forms: "表单",
  slides: "幻灯片",
  videos: "视频",
  analytics: "分析看板",
  chat: "聊天",
  dispatch: "调度",
  macros: "宏",
  clips: "录屏",
  design: "设计",
  assets: "资产",
  brain: "大脑",
  plan: "计划",
};

export function AppLauncher() {
  const [isOpen, setIsOpen] = useState(false);
  const [appId, setAppId] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevWriteIdRef = useRef("");
  const srcRef = useRef("");

  const handleClose = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setAppId("");
      setAppUrl("");
      // Release iframe resources — clear src so the iframe stops loading
      // the previous app's content, freeing memory and network connections.
      srcRef.current = "";
      if (iframeRef.current) {
        iframeRef.current.src = "about:blank";
      }
    }
  }, []);

  // Poll application_state for launch-app commands from the agent
  useEffect(() => {
    let disposed = false;

    const checkLaunchState = async () => {
      try {
        const state = (await readAppState("launchApp")) as
          | LaunchAppState
          | null
          | undefined;
        if (!state?.open || !state?.appId) return;

        // Deduplicate using write ID
        const writeId = String(
          (state as Record<string, unknown>)._writeId ?? "",
        );
        if (writeId && writeId === prevWriteIdRef.current) return;
        if (writeId) prevWriteIdRef.current = writeId;

        const resolvedUrl =
          state.url || DEFAULT_APP_URLS[state.appId] || "";
        srcRef.current = resolvedUrl;

        if (!disposed) {
          setAppId(state.appId);
          setAppUrl(resolvedUrl);
          setIsOpen(true);
        }

        // Clear the state so it doesn't re-trigger
        await writeAppState("launchApp", { open: false });
      } catch {
        // Application state not available — skip
      }
    };

    // Check immediately and then poll
    void checkLaunchState();
    const interval = setInterval(
      checkLaunchState,
      APP_LAUNCHER_POLL_INTERVAL_MS,
    );

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, []);

  const appName = APP_NAMES[appId] || appId || "应用";

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="flex max-h-[90vh] flex-col"
        style={{ maxWidth: "90vw", width: "90vw" }}
      >
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-lg font-semibold">
            {appName}
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleClose(false)}
            aria-label="关闭"
          >
            <IconX size={16} />
          </Button>
        </DialogHeader>
        <div className="flex-1 overflow-hidden rounded-md border">
          {appUrl ? (
            <iframe
              ref={iframeRef}
              src={appUrl}
              className="h-full w-full"
              title={appName}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              style={{ minHeight: "70vh" }}
            />
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center text-muted-foreground">
              {appId
                ? `未为“${appId}”配置 URL`
                : "未选择应用"}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
