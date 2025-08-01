// AI Chat Widget JavaScript
class ChatWidget {
  constructor(tableId) {
    this.tableId = tableId;
    this.isOpen = false;
    this.isLoading = false;
    this.token = localStorage.getItem('token');
    this.API_BASE = window.API_BASE || '';
    this.conversationHistory = []; // Store conversation for context
    
    this.init();
  }

  init() {
    // Load chat HTML and CSS if not already loaded
    this.loadChatComponents().then(() => {
      this.setupEventListeners();
      this.addWelcomeMessage();
    });
  }

  async loadChatComponents() {
    // Load CSS if not already loaded
    if (!document.querySelector('link[href*="chat.css"]')) {
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'css/chat.css';
      document.head.appendChild(cssLink);
    }

    // Load HTML if not already loaded
    if (!document.getElementById('chatButton')) {
      try {
        const response = await fetch('components/chat.html');
        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);
      } catch (error) {
        console.error('Failed to load chat component:', error);
        // Fallback - create basic HTML
        this.createFallbackHTML();
      }
    }
  }

  createFallbackHTML() {
    const chatHTML = `
      <div id="chatButton" class="chat-button">
        <span class="material-symbols-outlined">smart_toy</span>
      </div>
      <div id="chatPanel" class="chat-panel">
        <div class="chat-header">
          <strong>Event Assistant</strong>
          <button id="closeChatBtn" class="close-chat-btn">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div id="chatMessages" class="chat-messages"></div>
        <div class="chat-input-container">
          <input id="chatInput" type="text" placeholder="Ask about this event..." class="chat-input">
          <button id="sendBtn" class="send-btn">
            <span class="material-symbols-outlined">send</span>
          </button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', chatHTML);
  }

  setupEventListeners() {
    const chatButton = document.getElementById('chatButton');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const sendBtn = document.getElementById('sendBtn');
    const chatInput = document.getElementById('chatInput');

    if (chatButton) {
      chatButton.addEventListener('click', () => this.toggleChat());
    }

    if (closeChatBtn) {
      closeChatBtn.addEventListener('click', () => this.closeChat());
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendMessage());
    }

    if (chatInput) {
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !this.isLoading) {
          this.sendMessage();
        }
      });
    }
  }

  toggleChat() {
    if (this.isOpen) {
      this.closeChat();
    } else {
      this.openChat();
    }
  }

  openChat() {
    const chatPanel = document.getElementById('chatPanel');
    if (chatPanel) {
      chatPanel.style.display = 'flex';
      this.isOpen = true;
      
      // Focus on input
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        setTimeout(() => chatInput.focus(), 100);
      }
    }
  }

  closeChat() {
    const chatPanel = document.getElementById('chatPanel');
    if (chatPanel) {
      chatPanel.style.display = 'none';
      this.isOpen = false;
    }
  }

  addWelcomeMessage() {
    const eventTitle = document.getElementById('eventTitle')?.textContent || 'this event';
    const welcomeMessage = `Hi! I'm Luma, your AI assistant for ${eventTitle}. I can help you find information about schedules, crew assignments, gear lists, travel details, and more. What would you like to know? 📸`;
    this.addMessage('assistant', welcomeMessage);
    
    // Add welcome message to conversation history
    this.conversationHistory.push({ role: 'assistant', content: welcomeMessage });
  }

  async sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    
    if (!message || this.isLoading) return;

    // Add user message to chat
    this.addMessage('user', message);
    chatInput.value = '';

    // Show typing indicator
    this.showTypingIndicator();
    this.isLoading = true;
    this.updateSendButton(false);

    try {
      // Gather additional context about the current page/state
      const pageContext = {
        currentPage: window.location.pathname,
        activeTab: document.querySelector('.tab-button.active')?.textContent?.trim() || null,
        currentView: document.querySelector('.view-container.active')?.id || null,
        browserLanguage: navigator.language || 'en-US'
      };

      const response = await fetch(`${this.API_BASE}/api/chat/${this.tableId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token
        },
        body: JSON.stringify({ 
          message,
          conversationHistory: this.conversationHistory,
          pageContext 
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Add user message to conversation history immediately
      this.conversationHistory.push({ role: 'user', content: message });
      
      // Remove typing indicator and prepare for streaming response
      this.hideTypingIndicator();
      
      // Create message container for streaming response
      const messageContainer = this.addStreamingMessage('assistant');
      
      // Handle streaming response
      await this.handleStreamingResponse(response, messageContainer);

    } catch (error) {
      console.error('Chat error:', error);
      this.hideTypingIndicator();
      
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      if (error.message.includes('401') || error.message.includes('403')) {
        errorMessage = 'Please log in to use the chat feature.';
      } else if (error.message.includes('404')) {
        errorMessage = 'Event not found. Please refresh the page.';
      }
      
      this.addMessage('assistant', errorMessage);
    } finally {
      this.isLoading = false;
      this.updateSendButton(true);
    }
  }

  addMessage(sender, content) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    
    const senderLabel = sender === 'user' ? 'You' : 'Luma';
    
    messageDiv.innerHTML = `
      <div class="message-sender">${senderLabel}</div>
      <div class="message-content">${this.formatMessage(content)}</div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageDiv;
  }

  addStreamingMessage(sender) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return null;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    
    const senderLabel = sender === 'user' ? 'You' : 'Luma';
    
    messageDiv.innerHTML = `
      <div class="message-sender">${senderLabel}</div>
      <div class="message-content"></div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageDiv.querySelector('.message-content');
  }

  async handleStreamingResponse(response, messageContainer) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.error) {
                messageContainer.innerHTML = `<span style="color: #cc0007;">${data.error}</span>`;
                return;
              }
              
              if (data.content) {
                fullResponse += data.content;
                messageContainer.innerHTML = this.formatMessage(fullResponse) + '<span class="typing-cursor">|</span>';
                
                // Auto-scroll to bottom
                const chatMessages = document.getElementById('chatMessages');
                if (chatMessages) {
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
              }
              
              if (data.done) {
                // Remove typing cursor and finalize message
                messageContainer.innerHTML = this.formatMessage(fullResponse);
                
                // Add to conversation history
                this.conversationHistory.push({ role: 'assistant', content: fullResponse });
                
                // Keep only last 20 messages to avoid memory issues
                if (this.conversationHistory.length > 20) {
                  this.conversationHistory = this.conversationHistory.slice(-20);
                }
                return;
              }
            } catch (parseError) {
              console.error('Error parsing streaming data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      messageContainer.innerHTML = '<span style="color: #cc0007;">Connection error. Please try again.</span>';
    }
  }

  formatMessage(content) {
    // Basic formatting for AI responses
    return content
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
  }

  showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
      Assistant is typing
      <div class="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;

    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  updateSendButton(enabled) {
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
      sendBtn.disabled = !enabled;
    }
  }

  destroy() {
    // Remove chat elements from DOM
    const chatButton = document.getElementById('chatButton');
    const chatPanel = document.getElementById('chatPanel');
    
    if (chatButton) chatButton.remove();
    if (chatPanel) chatPanel.remove();
    
    // Remove chat CSS if no other instance needs it
    const chatCss = document.querySelector('link[href*="chat.css"]');
    if (chatCss) chatCss.remove();
    
    console.log('Chat widget destroyed');
  }
}

// Global function to initialize chat
window.initChat = function(tableId) {
  // Clean up existing chat widget
  if (window.chatWidget) {
    window.chatWidget.destroy();
    window.chatWidget = null;
  }
  
  if (tableId) {
    window.chatWidget = new ChatWidget(tableId);
  }
};

// Auto-initialize if tableId is available
document.addEventListener('DOMContentLoaded', function() {
  // Try to get tableId from various sources
  const tableId = window.currentTableId || 
                  new URLSearchParams(window.location.search).get('id') ||
                  (window.location.hash && window.location.hash.includes('#') ? 
                   window.location.hash.split('/')[1] : null);
  
  if (tableId) {
    window.initChat(tableId);
  }
}); 