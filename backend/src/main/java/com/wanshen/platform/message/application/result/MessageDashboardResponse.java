package com.wanshen.platform.message.application.result;

import com.wanshen.platform.message.AbstractMessageStore.MessageRecord;

import java.util.List;

public record MessageDashboardResponse(
        int total,
        int unread,
        long archived,
        long starred,
        List<MessageCategoryCount> byCategory,
        List<MessagePriorityCount> byPriority,
        List<MessageRecord> recentUnread
) {
    public record MessageCategoryCount(String category, long count) {}

    public record MessagePriorityCount(String priority, long count) {}
}
