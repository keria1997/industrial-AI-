package com.wanshen.platform.message.infrastructure.persistence;

import com.wanshen.platform.message.AbstractMessageStore.MessageRecord;
import com.wanshen.platform.message.domain.MessageMetadata;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** JPA mapping for an existing notification fact. */
@Entity
@Table(name = "msg_record")
public class MessageRecordEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "api_id", updatable = false)
    private String businessId;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private String tenantId;

    @Column(name = "msg_no", nullable = false)
    private String messageNo;

    @Column(name = "template_code")
    private String templateCode;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "channel", nullable = false)
    private String channel;

    @Column(name = "priority", nullable = false)
    private String priority;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "body", nullable = false)
    private String body;

    @Column(name = "recipient_id", nullable = false)
    private String recipientId;

    @Column(name = "recipient_name", nullable = false)
    private String recipientName = "";

    @Column(name = "sender_id", nullable = false)
    private String senderId = "system";

    @Column(name = "sender_name", nullable = false)
    private String senderName = "系统";

    @Column(name = "source_type", nullable = false)
    private String sourceType = "";

    @Column(name = "source_id", nullable = false)
    private String sourceId = "";

    @Column(name = "source_doc_no", nullable = false)
    private String sourceDocumentNo = "";

    @Column(name = "is_read", nullable = false)
    private boolean read;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "is_archived", nullable = false)
    private boolean archived;

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Column(name = "is_starred", nullable = false)
    private boolean starred;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", nullable = false)
    private MessageMetadata metadata;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "error_message", nullable = false)
    private String errorMessage = "";

    @Column(name = "sent_at")
    private Instant sentAt;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected MessageRecordEntity() {}

    public MessageRecordEntity(
            UUID id, String businessId, String tenantId, String messageNo, String templateCode,
            String category, String channel, String priority, String title, String body,
            String recipientId, String recipientName, String senderId, String senderName,
            String sourceType, String sourceId, String sourceDocumentNo,
            boolean read, Instant readAt, boolean archived, Instant archivedAt,
            boolean starred, MessageMetadata metadata, String status,
            String errorMessage, Instant sentAt, Instant createdAt, Instant updatedAt
    ) {
        this.id = id;
        this.businessId = businessId;
        this.tenantId = tenantId;
        this.messageNo = messageNo;
        this.templateCode = templateCode;
        this.category = category;
        this.channel = channel;
        this.priority = priority;
        this.title = title;
        this.body = body;
        this.recipientId = recipientId;
        this.recipientName = recipientName;
        this.senderId = senderId;
        this.senderName = senderName;
        this.sourceType = sourceType;
        this.sourceId = sourceId;
        this.sourceDocumentNo = sourceDocumentNo;
        this.read = read;
        this.readAt = readAt;
        this.archived = archived;
        this.archivedAt = archivedAt;
        this.starred = starred;
        this.metadata = metadata == null ? MessageMetadata.empty() : metadata;
        this.status = status;
        this.errorMessage = errorMessage;
        this.sentAt = sentAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public void apply(MessageRecord record, Instant changedAt) {
        read = record.isRead();
        readAt = parse(record.readAt());
        archived = record.isArchived();
        archivedAt = parse(record.archivedAt());
        starred = record.isStarred();
        metadata = record.metadata() == null ? MessageMetadata.empty() : record.metadata();
        status = record.status();
        errorMessage = record.errorMessage();
        sentAt = parse(record.sentAt());
        updatedAt = changedAt;
    }

    public UUID id() { return id; }
    public String businessId() { return businessId; }
    public String tenantId() { return tenantId; }
    public String messageNo() { return messageNo; }
    public String templateCode() { return templateCode; }
    public String category() { return category; }
    public String channel() { return channel; }
    public String priority() { return priority; }
    public String title() { return title; }
    public String body() { return body; }
    public String recipientId() { return recipientId; }
    public String recipientName() { return recipientName; }
    public String senderId() { return senderId; }
    public String senderName() { return senderName; }
    public String sourceType() { return sourceType; }
    public String sourceId() { return sourceId; }
    public String sourceDocumentNo() { return sourceDocumentNo; }
    public boolean read() { return read; }
    public Instant readAt() { return readAt; }
    public boolean archived() { return archived; }
    public Instant archivedAt() { return archivedAt; }
    public boolean starred() { return starred; }
    public MessageMetadata metadata() { return metadata == null ? MessageMetadata.empty() : metadata; }
    public String status() { return status; }
    public String errorMessage() { return errorMessage; }
    public Instant sentAt() { return sentAt; }
    public long rowVersion() { return rowVersion; }
    public Instant createdAt() { return createdAt; }
    public Instant updatedAt() { return updatedAt; }

    private Instant parse(String value) { return value == null || value.isBlank() ? null : Instant.parse(value); }
}
