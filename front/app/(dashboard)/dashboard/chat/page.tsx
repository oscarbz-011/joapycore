"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatList } from "@/components/chat/chat-list";
import { ChatThread } from "@/components/chat/chat-thread";
import { CHAT_PATH, useChatIdentity } from "@/components/chat/use-chat";

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <Chat />
    </Suspense>
  );
}

function Chat() {
  const router = useRouter();
  const selectedId = useSearchParams().get("c");
  const { tenantId, userId } = useChatIdentity();
  const open = (conversationId: string | null) =>
    router.replace(conversationId ? `${CHAT_PATH}?c=${conversationId}` : CHAT_PATH, {
      scroll: false,
    });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Chat</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mensajes con tus compañeros de la empresa.
        </p>
      </div>
      <div className="grid gap-4 lg:h-[calc(100dvh-13rem)] lg:min-h-[480px] lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
        <div className={cn("min-h-0 lg:flex lg:flex-col", selectedId ? "hidden" : "flex flex-col")}>
          <ChatList
            key={`${tenantId}:${userId}`}
            selectedId={selectedId}
            onSelect={(conversationId) => open(conversationId)}
          />
        </div>
        {selectedId ? (
          <ChatThread
            key={`${tenantId}:${userId}:${selectedId}`}
            conversationId={selectedId}
            onBack={() => open(null)}
          />
        ) : (
          <div className="hidden flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground lg:flex">
            <MessageSquare size={28} />
            <p>Elegí una conversación o empezá un chat nuevo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
