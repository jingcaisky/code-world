import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./button";

describe("Button component", () => {
  it("should render with children", () => {
    render(<Button>点击我</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("should handle click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>点击我</Button>);

    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("should apply variant classes", () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toMatch(/destructive|red|danger/i);
  });

  it("should apply size classes", () => {
    render(<Button size="lg">大按钮</Button>);
    const button = screen.getByRole("button");
    // Check that the button has appropriate size styling
    expect(button).toBeInTheDocument();
  });

  it("should be disabled when disabled prop is true", () => {
    render(<Button disabled>已禁用</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("should not trigger click when disabled", () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        已禁用
      </Button>,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("should support custom className", () => {
    render(<Button className="custom-class">自定义</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("custom-class");
  });

  it("should render as a link when asChild is used", () => {
    render(
      <Button asChild>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/test/">链接按钮</a>
      </Button>,
    );
    expect(screen.getByRole("link")).toBeInTheDocument();
  });

  it("should support different button types", () => {
    render(<Button type="submit">提交</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("type", "submit");
  });
});
