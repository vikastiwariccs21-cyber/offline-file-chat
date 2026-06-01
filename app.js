/**
 * OFFLINE FILE CHAT - VANILLA JAVASCRIPT APPLICATION
 * Production-Grade Frontend Implementation
 * Handles file uploads, streaming chat, and real-time UI updates
 */

// ============================================================================
// CONFIGURATION & STATE
// ============================================================================

const CONFIG = {
    API_BASE: "http://localhost:8000",
    SESSION_ID: generateSessionId(),
    UPLOAD_ENDPOINT: "/upload",
    CHAT_ENDPOINT: "/chat",
};

let appState = {
    files: new Map(), // file_id -> { filename, size, content_preview }
    selectedFiles: new Set(), // Set of selected file_ids
    conversationHistory: [],
    isLoading: false,
    currentStreamingMessage: null,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a unique session ID
 */
function generateSessionId() {
    return "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format file size to human-readable format
 */
function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Get file icon based on extension
 */
function getFileIcon(filename) {
    const ext = filename.toLowerCase().split(".").pop();
    const icons = {
        pdf: "📄",
        txt: "📝",
        docx: "📖",
        doc: "📖",
        csv: "📊",
    };
    return icons[ext] || "📎";
}

/**
 * Convert markdown-like content to HTML
 */
function formatMessageContent(text) {
    let html = escapeHtml(text);

    // Convert code blocks (```code```)
    html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");

    // Convert inline code (`code`)
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Convert bold (**text**)
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Convert italic (*text* or _text_)
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

    // Convert line breaks
    html = html.replace(/\n/g, "<br>");

    return html;
}

// ============================================================================
// DOM ELEMENT REFERENCES
// ============================================================================

const elements = {
    uploadZone: document.getElementById("uploadZone"),
    fileInput: document.getElementById("fileInput"),
    uploadStatus: document.getElementById("uploadStatus"),
    uploadStatusText: document.getElementById("uploadStatusText"),
    filesContainer: document.getElementById("filesContainer"),
    chatMessages: document.getElementById("chatMessages"),
    chatInput: document.getElementById("chatInput"),
    sendBtn: document.getElementById("sendBtn"),
    clearSessionBtn: document.getElementById("clearSessionBtn"),
};

// ============================================================================
// FILE UPLOAD HANDLING
// ============================================================================

/**
 * Setup file upload event listeners
 */
function setupFileUploadListeners() {
    // Click to upload
    elements.uploadZone.addEventListener("click", () => {
        elements.fileInput.click();
    });

    // File input change
    elements.fileInput.addEventListener("change", (e) => {
        handleFileSelection(e.target.files);
    });

    // Drag and drop
    elements.uploadZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        elements.uploadZone.classList.add("drag-over");
    });

    elements.uploadZone.addEventListener("dragleave", () => {
        elements.uploadZone.classList.remove("drag-over");
    });

    elements.uploadZone.addEventListener("drop", (e) => {
        e.preventDefault();
        elements.uploadZone.classList.remove("drag-over");
        handleFileSelection(e.dataTransfer.files);
    });
}

/**
 * Handle file selection and upload
 */
async function handleFileSelection(files) {
    if (files.length === 0) return;

    for (const file of files) {
        await uploadFile(file);
    }
}

/**
 * Upload a single file to the backend
 */
async function uploadFile(file) {
    try {
        // Show loading state
        showUploadStatus(`Processing: ${file.name}...`);

        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${CONFIG.API_BASE}${CONFIG.UPLOAD_ENDPOINT}`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }

        const data = await response.json();

        // Store file in app state
        appState.files.set(data.file_id, {
            filename: data.filename,
            size: data.size,
            file_id: data.file_id,
            extracted_chars: data.extracted_chars,
        });

        // Update UI
        renderFilesList();
        addSystemMessage(`✅ Uploaded: ${data.filename} (${data.extracted_chars} characters)`);
        hideUploadStatus();
    } catch (error) {
        console.error("File upload error:", error);
        addSystemMessage(`❌ Error uploading ${file.name}: ${error.message}`);
        hideUploadStatus();
    }
}

/**
 * Show upload status with spinner
 */
function showUploadStatus(message) {
    elements.uploadStatus.style.display = "flex";
    elements.uploadStatusText.textContent = message;
}

/**
 * Hide upload status
 */
function hideUploadStatus() {
    elements.uploadStatus.style.display = "none";
}

/**
 * Render the files list in sidebar
 */
function renderFilesList() {
    if (appState.files.size === 0) {
        elements.filesContainer.innerHTML =
            '<p class="empty-state">No files uploaded yet</p>';
        return;
    }

    let html = "";
    appState.files.forEach((file, file_id) => {
        const isSelected = appState.selectedFiles.has(file_id);
        html += `
            <div class="file-item ${isSelected ? "selected" : ""}" data-file-id="${file_id}">
                <div class="file-icon">${getFileIcon(file.filename)}</div>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(file.filename)}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
                <button class="file-remove" data-file-id="${file_id}">×</button>
            </div>
        `;
    });

    elements.filesContainer.innerHTML = html;

    // Attach event listeners
    document.querySelectorAll(".file-item").forEach((item) => {
        item.addEventListener("click", (e) => {
            if (!e.target.classList.contains("file-remove")) {
                toggleFileSelection(item.dataset.fileId);
            }
        });
    });

    document.querySelectorAll(".file-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            removeFile(btn.dataset.fileId);
        });
    });
}

/**
 * Toggle file selection for chat context
 */
function toggleFileSelection(file_id) {
    if (appState.selectedFiles.has(file_id)) {
        appState.selectedFiles.delete(file_id);
    } else {
        appState.selectedFiles.add(file_id);
    }
    renderFilesList();
}

/**
 * Remove a file from the app state
 */
function removeFile(file_id) {
    appState.files.delete(file_id);
    appState.selectedFiles.delete(file_id);
    renderFilesList();
}

// ============================================================================
// CHAT MESSAGE HANDLING
// ============================================================================

/**
 * Setup chat event listeners
 */
function setupChatListeners() {
    elements.sendBtn.addEventListener("click", sendMessage);

    // Enter to send, Shift+Enter for newline
    elements.chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    elements.clearSessionBtn.addEventListener("click", clearSession);
}

/**
 * Send a chat message
 */
async function sendMessage() {
    const message = elements.chatInput.value.trim();

    if (!message || appState.isLoading) return;

    // Clear input
    elements.chatInput.value = "";
    elements.chatInput.style.height = "auto";

    // Add user message to UI
    addUserMessage(message);

    // Add to conversation history
    appState.conversationHistory.push({
        role: "user",
        content: message,
    });

    // Show loading state
    appState.isLoading = true;
    elements.sendBtn.disabled = true;

    try {
        // Start streaming chat response
        await streamChatResponse(message);
    } catch (error) {
        console.error("Chat error:", error);
        addSystemMessage(`❌ Error: ${error.message}`);
    } finally {
        appState.isLoading = false;
        elements.sendBtn.disabled = false;
    }
}

/**
 * Stream chat response from server
 */
async function streamChatResponse(userMessage) {
    const file_ids = Array.from(appState.selectedFiles);

    const payload = {
        session_id: CONFIG.SESSION_ID,
        message: userMessage,
        file_ids: file_ids,
    };

    try {
        const response = await fetch(`${CONFIG.API_BASE}${CONFIG.CHAT_ENDPOINT}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Chat failed: ${response.statusCode}`);
        }

        // Create assistant message bubble
        const messageDiv = createMessageElement("assistant");
        const bubbleDiv = messageDiv.querySelector(".message-bubble");
        elements.chatMessages.appendChild(messageDiv);

        // Track full response
        let fullResponse = "";

        // Read streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();

                    if (!dataStr) continue;

                    try {
                        const data = JSON.parse(dataStr);

                        if (data.done) {
                            break;
                        }

                        if (data.token) {
                            // Append token to response
                            fullResponse += data.token;
                            bubbleDiv.innerHTML = formatMessageContent(fullResponse);
                            scrollToBottom();
                        }

                        if (data.error) {
                            throw new Error(data.error);
                        }
                    } catch (e) {
                        // Silently skip JSON parse errors
                        console.debug("JSON parse error:", e);
                    }
                }
            }
        }

        // Store in conversation history
        appState.conversationHistory.push({
            role: "assistant",
            content: fullResponse,
        });
    } catch (error) {
        // Remove the message bubble on error
        const messages = elements.chatMessages.querySelectorAll(".message");
        if (messages.length > 0) {
            messages[messages.length - 1].remove();
        }
        throw error;
    }
}

/**
 * Create a message element (user or assistant)
 */
function createMessageElement(role) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;

    const avatarDiv = document.createElement("div");
    avatarDiv.className = "message-avatar";
    avatarDiv.textContent = role === "user" ? "👤" : "🤖";

    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "message-bubble";
    bubbleDiv.innerHTML =
        role === "assistant"
            ? '<div class="message-loading"><div class="loading-dots"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div></div>'
            : "";

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(bubbleDiv);

    return messageDiv;
}

/**
 * Add user message to chat
 */
function addUserMessage(content) {
    const messageDiv = createMessageElement("user");
    const bubbleDiv = messageDiv.querySelector(".message-bubble");
    bubbleDiv.innerHTML = formatMessageContent(content);

    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Add system message to chat
 */
function addSystemMessage(content) {
    const messageDiv = document.createElement("div");
    messageDiv.style.padding = "var(--spacing-md)";
    messageDiv.style.textAlign = "center";
    messageDiv.style.color = "var(--text-secondary)";
    messageDiv.style.fontSize = "12px";
    messageDiv.innerHTML = content;

    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Scroll to bottom of chat
 */
function scrollToBottom() {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

/**
 * Clear session
 */
async function clearSession() {
    if (confirm("Are you sure you want to clear the session? This will delete all files and conversation history.")) {
        appState.conversationHistory = [];
        appState.selectedFiles.clear();
        appState.files.clear();
        elements.chatMessages.innerHTML = `
            <div class="welcome-message">
                <h2>Welcome to Offline File Chat</h2>
                <p>Upload documents (PDF, TXT, DOCX, CSV) and start asking questions.</p>
                <p class="info-text">💡 All processing happens locally on your machine.</p>
            </div>
        `;
        renderFilesList();
    }
}

// ============================================================================
// AUTO-RESIZE TEXTAREA
// ============================================================================

function setupTextareaAutoResize() {
    elements.chatInput.addEventListener("input", () => {
        elements.chatInput.style.height = "auto";
        elements.chatInput.style.height =
            Math.min(elements.chatInput.scrollHeight, 120) + "px";
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application
 */
function initializeApp() {
    console.log("Initializing Offline File Chat Application");
    console.log("Session ID:", CONFIG.SESSION_ID);
    console.log("API Base:", CONFIG.API_BASE);

    setupFileUploadListeners();
    setupChatListeners();
    setupTextareaAutoResize();

    // Log app ready
    console.log("✅ Application ready");
}

// Start app when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
} else {
    initializeApp();
}
