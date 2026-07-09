"use client";

import { useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  FormField,
  Input,
} from "@/components/ui";
import { SectionCard } from "@/components/settings/settings-section";
import { useAuth } from "@/hooks";
import { apiClient, ApiError } from "@/lib/api-client";

export default function AccountSettingsPage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/auth/password/change", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      // Backend may not have this endpoint yet — surface a helpful message.
      if (err instanceof ApiError && err.status === 404) {
        toast.error("Password change requires backend wiring (POST /auth/password/change).");
      } else {
        toast.error(err instanceof ApiError ? err.message : "更新密码失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/users/${user.id}`);
      toast.success("Account deleted");
      logout();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        toast.error("Self-delete not enabled. Contact support.");
      } else {
        toast.error(err instanceof ApiError ? err.message : "删除账号失败");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="修改密码"
        description="Use a strong, unique password — 8+ characters, mixed case, numbers."
        action={
          <Button
            onClick={handleChangePassword}
            disabled={saving || !currentPassword || !newPassword}
            size="sm"
          >
            {saving ? "保存中…" : "更新密码"}
          </Button>
        }
      >
        <div className="space-y-4">
          <FormField label="当前密码" htmlFor="current-pw">
            <Input
              id="current-pw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="新密码" htmlFor="new-pw">
              <Input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
            <FormField label="确认新密码" htmlFor="confirm-pw">
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </FormField>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="注销所有设备"
        description="撤销包括当前会话在内的所有活跃会话，你会立即退出登录。"
      >
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Lock className="mr-2 h-3.5 w-3.5" />
              注销所有设备
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>是否注销所有设备？</AlertDialogTitle>
              <AlertDialogDescription>
                这将撤销所有活动的会话，并将你从当前设备中注销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    await apiClient.delete("/sessions");
                    toast.success("Signed out from all devices");
                    logout();
                  } catch {
                    toast.error("全端退出失败");
                  }
                }}
              >
                注销所有设备
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SectionCard>

      <SectionCard
        title="删除账号"
        description="永久删除你的账户、对话记录和上传的数据。此操作无法撤销。"
      >
        <div className="border-border bg-muted flex items-start gap-3 rounded-xl border p-4">
          <span className="bg-card border-border text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm font-semibold">此操作不可逆</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              All conversations, knowledge base contents, API keys, and personal data will be
              将被永久删除。有效订阅会被取消。
            </p>
          </div>
        </div>
        <div className="mt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                删除我的账号
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除你的账号？</AlertDialogTitle>
                <AlertDialogDescription>
                  Your conversations, knowledge base contents, API keys, and all personal data will
                  将被永久删除。有效订阅会被取消。此操作不可撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
                  onClick={handleDeleteAccount}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Deleting…" : "Yes, delete my account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SectionCard>
    </div>
  );
}
