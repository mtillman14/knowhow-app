// KnowHow - Main JavaScript

// API Base URL
const API_BASE = '/api';

// Helper function to make authenticated API calls
async function apiCall(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
        ...options
    };

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, defaultOptions);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

// Get current user
async function getCurrentUser() {
    try {
        return await apiCall('/auth/me');
    } catch (error) {
        return null;
    }
}

// Check if user is authenticated
async function checkAuth() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = '/';
        return false;
    }
    return user;
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
}

// Format number
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

// Get user initials for avatar
function getUserInitials(firstName, lastName) {
    const first = firstName ? firstName[0] : '';
    const last = lastName ? lastName[0] : '';
    return (first + last).toUpperCase() || '?';
}

// Create user avatar element
function createUserAvatar(user) {
    const initials = getUserInitials(user.first_name, user.last_name);
    return `<div class="user-avatar" title="${user.first_name} ${user.last_name}">${initials}</div>`;
}

// Markdown-like parser (simple implementation)
function parseMarkdown(text) {
    if (!text) return '';

    // Escape HTML
    text = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks
    text = text.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');

    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Line breaks
    text = text.replace(/\n/g, '<br>');

    return text;
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    notification.style.cssText = `
        position: fixed;
        top: 70px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'error' ? '#d32f2f' : type === 'success' ? '#5fa146' : '#0077cc'};
        color: white;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS animations for notifications
if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// Export for use in other files
window.KnowHow = {
    apiCall,
    getCurrentUser,
    checkAuth,
    formatDate,
    formatNumber,
    getUserInitials,
    createUserAvatar,
    parseMarkdown,
    showNotification
};
