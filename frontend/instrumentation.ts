
import { registerOTel } from "@vercel/otel";

export function register() {
  registerOTel({
    serviceName: "multi_agent-frontend",
  });
}
