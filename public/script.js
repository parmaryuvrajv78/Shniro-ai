/* ======================
    CORE VARIABLES
====================== */
const themeToggle = document.getElementById("themeToggle");
const solveBtn = document.getElementById("solveBtn");
const outputContent = document.getElementById("outputContent");
const chatHistory = document.getElementById("chatHistory");
const imageInput = document.getElementById("imageInput");
const uploadStatus = document.getElementById("uploadStatus");
const promptInput = document.getElementById("prompt");
const resetBtn = document.getElementById("resetBtn");
const menuBtn = document.getElementById("menuBtn");
const sidebarEl = document.querySelector(".sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const accountBtn = document.getElementById("accountBtn");
const historyList = document.getElementById("historyList");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const removeImageBtn = document.getElementById("removeImageBtn");
const upgradeBtn = document.getElementById("upgradeBtn");
const upgradeModal = document.getElementById("upgradeModal");
const closeUpgrade = document.getElementById("closeUpgrade");
const startPremium = document.getElementById("startPremium");
const confirmModal = document.getElementById("confirmModal");
const cancelDelete = document.getElementById("cancelDelete");
const confirmDeleteBtn = document.getElementById("confirmDelete");
const installBtn = document.getElementById("installBtn");
const adminBtn = document.getElementById("adminBtn");
const adminModal = document.getElementById("adminModal");
const closeAdmin = document.getElementById("closeAdmin");
const analyticsContent = document.getElementById("analyticsContent");
const quizBtn = document.getElementById("quizBtn");
const quizModal = document.getElementById("quizModal");
const closeQuiz = document.getElementById("closeQuiz");
const quizTopic = document.getElementById("quizTopic");
const quizCount = document.getElementById("quizCount");
const generateQuizBtn = document.getElementById("generateQuizBtn");
const quizContent = document.getElementById("quizContent");

let currentUser = null;
let uploadedImage = null;
let displayMode = "rich";
let currentAnswerEl = null; // tracks the active answer div for typing
let hasInteracted = false; // tracks if the user has sent at least one prompt
let currentChatId = null; // tracks the active chat session id
let activeQuiz = null;

/* ======================
    NOTIFICATION SYSTEM
====================== */
function showNotification(message, icon = "info") {
  // Remove existing notifications first
  document.querySelectorAll(".custom-notification").forEach(n => n.remove());
  
  const notifyEl = document.createElement("div");
  notifyEl.className = "custom-notification glass";
  notifyEl.innerHTML = `<i data-lucide="${icon}"></i><span></span>`;
  notifyEl.querySelector("span").textContent = message;
  document.body.appendChild(notifyEl);
  lucide.createIcons();
  
  setTimeout(() => {
    notifyEl.classList.add("fade-out");
    setTimeout(() => notifyEl.remove(), 400);
  }, 3000);
}

/* ======================
    NATIVE FEEL HELPERS
====================== */
function hapticFeedback(type = 'light') {
  if (!window.navigator || !window.navigator.vibrate) return;
  if (type === 'light') window.navigator.vibrate(10);
  else if (type === 'medium') window.navigator.vibrate(18);
  else if (type === 'heavy') window.navigator.vibrate([15, 10, 15]);
}

/* ======================
    AUTH & SESSION
====================== */
async function checkAuth() {
  try {
    const res = await fetch("/api/auth/me");
    if (res.status === 401) {
      localStorage.removeItem('shniro_user');
      if (!window.location.pathname.includes('auth.html')) {
        window.location.href = '/auth.html';
      }
      return;
    }
    const data = await res.json();
    if (res.ok && data.user) {
      currentUser = data.user;
      updateSidebarUser();
    }
  } catch (err) {}
}

function updateSidebarUser() {
  if (currentUser && accountBtn) {
    accountBtn.innerHTML = `<i data-lucide="user-check" style="color: #64ffda"></i><span class="sidebar-label">${currentUser.username}</span>`;
    accountBtn.href = "#";
    accountBtn.onclick = (e) => {
      e.preventDefault();
      const logoutModal = document.getElementById("logoutModal");
      logoutModal.classList.remove("hidden");
      hapticFeedback('light');
    };
    lucide.createIcons();
  }

  if (adminBtn && currentUser?.isAdmin) {
    adminBtn.classList.remove("hidden");
  }
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function renderSafeMarkdown(value = "") {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = marked.parse(String(value));

  wrapper.querySelectorAll("script, style, iframe, object, embed").forEach(node => node.remove());
  wrapper.querySelectorAll("*").forEach(node => {
    [...node.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const attrValue = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "src") && attrValue.startsWith("javascript:"))) {
        node.removeAttribute(attr.name);
      }
    });
  });

  return wrapper.innerHTML;
}

function setUserPrompt(bubble, value) {
  const promptEl = document.createElement("div");
  promptEl.className = "user-prompt";
  promptEl.textContent = value || "(Image)";
  bubble.appendChild(promptEl);
}

// Modal Event Listeners
document.getElementById("cancelLogout")?.addEventListener("click", () => {
  document.getElementById("logoutModal").classList.add("hidden");
  hapticFeedback('light');
});

document.getElementById("confirmLogout")?.addEventListener("click", () => {
  document.getElementById("logoutModal").classList.add("hidden");
  logout();
});

document.getElementById("logoutModal")?.addEventListener("click", (e) => {
  if (e.target.id === "logoutModal") {
    document.getElementById("logoutModal").classList.add("hidden");
  }
});

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  localStorage.removeItem("shniro_user");
  window.location.reload();
}

// Initial check: Only redirect if we are on the main app and not logged in
const isAuthPage = window.location.pathname.includes('auth.html');
const userSession = localStorage.getItem('shniro_user');

if (!userSession && !isAuthPage) {
  window.location.href = '/auth.html';
} else if (userSession) {
  checkAuth().then(() => {
    fetchHistory();
  });
}

/* ======================
    CHAT HISTORY LOGIC
====================== */
async function fetchHistory() {
  if (!currentUser) return;
  try {
    const res = await fetch("/api/chats");
    const chats = await res.json();
    if (res.ok && historyList) {
      historyList.innerHTML = "";
      chats.forEach(chat => {
        const item = document.createElement("div");
        item.className = "history-item";

        const content = document.createElement("div");
        content.className = "history-item-content";
        content.title = chat.title || "Chat Session";
        content.textContent = chat.title || "Chat Session";
        content.addEventListener("click", () => loadChat(chat._id));

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-chat-btn";
        deleteBtn.type = "button";
        deleteBtn.title = "Delete chat";
        deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        deleteBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          deleteChat(chat._id);
        });

        item.appendChild(content);
        item.appendChild(deleteBtn);
        historyList.appendChild(item);
      });
      lucide.createIcons();
      
      if (!currentChatId && chats.length > 0 && !hasInteracted) {
        loadChat(chats[0]._id);
      }
    }
  } catch (err) {
    console.error("Failed to fetch history:", err);
  }
}

let pendingDeleteId = null;

async function deleteChat(chatId) {
  pendingDeleteId = chatId;
  confirmModal?.classList.remove("hidden");
  hapticFeedback('medium');
}

cancelDelete?.addEventListener("click", () => {
  confirmModal?.classList.add("hidden");
  pendingDeleteId = null;
});

confirmDeleteBtn?.addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  try {
    const res = await fetch(`/api/chats/${pendingDeleteId}`, { method: "DELETE" });
    if (res.ok) {
      showNotification("Chat deleted successfully", "trash-2");
      fetchHistory();
    }
  } catch (err) {
    console.error("Delete chat error:", err);
    showNotification("Failed to delete chat", "alert-circle");
  } finally {
    confirmModal?.classList.add("hidden");
    pendingDeleteId = null;
  }
});

// Add to window for onclick
window.deleteChat = deleteChat;

// Global variable to store loaded chats for quick access
let loadedChats = {};

async function loadChat(chatId) {
  // For simplicity, we'll re-fetch or find in existing list
  try {
    const res = await fetch("/api/chats");
    const chats = await res.json();
    const chat = chats.find(c => c._id === chatId);
    if (chat) {
      chatHistory.innerHTML = "";
      hasInteracted = true;
      currentChatId = chat._id;
      document.body.classList.add("post-first");
      
      chat.messages.forEach(msg => {
        const userBubble = document.createElement("div");
        userBubble.className = "chat-bubble user";
        setUserPrompt(userBubble, msg.prompt);
        chatHistory.appendChild(userBubble);

        const aiBubble = document.createElement("div");
        aiBubble.className = "chat-bubble ai";
        
        const bubbleHeader = document.createElement("div");
        bubbleHeader.className = "bubble-header";
        bubbleHeader.innerHTML = '<i data-lucide="bot" class="ai-icon"></i>';
        
        const copyBtn = document.createElement("button");
        copyBtn.className = "copy-btn";
        copyBtn.innerHTML = '<i data-lucide="copy"></i>';
        copyBtn.title = "Copy Answer";
        
        const ansDiv = document.createElement("div");
        ansDiv.className = "answer-text";
        ansDiv.innerHTML = renderSafeMarkdown(msg.response);
        
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(ansDiv.innerText);
          copyBtn.innerHTML = '<i data-lucide="check"></i>';
          hapticFeedback('light');
          setTimeout(() => {
            copyBtn.innerHTML = '<i data-lucide="copy"></i>';
            lucide.createIcons();
          }, 2000);
          lucide.createIcons();
        };

        aiBubble.appendChild(bubbleHeader);
        aiBubble.appendChild(ansDiv);
        aiBubble.appendChild(copyBtn);
        chatHistory.appendChild(aiBubble);
        
        if (msg.isImage && msg.imageUrl) {
          renderImageDownload(msg.imageUrl, ansDiv);
        }
      });
      
      lucide.createIcons();
      document.querySelectorAll(".answer-text").forEach(renderRichContent);
      chatHistory.scrollTo({ top: chatHistory.scrollHeight, behavior: 'smooth' });
      
      // Close sidebar on mobile after loading
      if (window.innerWidth <= 640) {
        sidebarEl?.classList.remove("open");
        sidebarBackdrop?.classList.remove("visible");
        document.body.style.overflow = "auto";
      }
    }
  } catch (err) {
    console.error("Load chat error:", err);
  }
}

// Add to window for onclick
window.loadChat = loadChat;

/* ======================
    PWA INSTALL LOGIC
====================== */
let deferredPrompt;

window.addEventListener("beforeinstallprompt", (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI notify the user they can install the PWA
  if (installBtn) installBtn.classList.remove("hidden");
});

installBtn?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  // Show the install prompt
  deferredPrompt.prompt();
  // Wait for the user to respond to the prompt
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`User response to the install prompt: ${outcome}`);
  // We've used the prompt, and can't use it again, throw it away
  deferredPrompt = null;
  // Hide our install button
  installBtn.classList.add("hidden");
  
  if (outcome === 'accepted') {
    showNotification("Shniro is being installed!", "check-circle");
  }
});

window.addEventListener("appinstalled", (evt) => {
  console.log("Shniro was installed");
  if (installBtn) installBtn.classList.add("hidden");
  showNotification("Shniro installed successfully!", "check-circle");
});

/* ======================
    UPGRADE MODAL
====================== */
upgradeBtn?.addEventListener("click", () => {
  upgradeModal.classList.remove("hidden");
  hapticFeedback('light');
});

closeUpgrade?.addEventListener("click", () => {
  upgradeModal.classList.add("hidden");
});

startPremium?.addEventListener("click", () => {
  showNotification("Premium checkout feature coming soon!", "zap");
  upgradeModal.classList.add("hidden");
});

/* ======================
    ADMIN ANALYTICS
====================== */
adminBtn?.addEventListener("click", () => {
  adminModal?.classList.remove("hidden");
  loadAdminAnalytics();
  hapticFeedback('light');
});

closeAdmin?.addEventListener("click", () => {
  adminModal?.classList.add("hidden");
});

adminModal?.addEventListener("click", (e) => {
  if (e.target.id === "adminModal") adminModal.classList.add("hidden");
});

async function loadAdminAnalytics() {
  if (!analyticsContent) return;
  analyticsContent.innerHTML = '<div class="quiz-loading"><i data-lucide="loader" class="spin"></i> Loading analytics...</div>';
  lucide.createIcons();

  try {
    const res = await fetch("/api/admin/analytics");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load analytics");

    const totals = data.totals || {};
    analyticsContent.innerHTML = `
      <div class="analytics-grid">
        <div class="metric-card"><span>Total Users</span><strong>${totals.users || 0}</strong></div>
        <div class="metric-card"><span>Free Users</span><strong>${totals.freeUsers || 0}</strong></div>
        <div class="metric-card"><span>Premium Users</span><strong>${totals.premiumUsers || 0}</strong></div>
        <div class="metric-card"><span>Total Chats</span><strong>${totals.chats || 0}</strong></div>
        <div class="metric-card"><span>Chats Today</span><strong>${totals.todayChats || 0}</strong></div>
        <div class="metric-card"><span>Last 7 Days</span><strong>${totals.weekChats || 0}</strong></div>
      </div>
      <div class="analytics-lists">
        <div>
          <h4>Recent Users</h4>
          ${renderAnalyticsRows(data.recentUsers, user => `${escapeHtml(user.username)} <span>${escapeHtml(user.plan || "free")}</span>`)}
        </div>
        <div>
          <h4>Most Active</h4>
          ${renderAnalyticsRows(data.topUsers, user => `${escapeHtml(user.username)} <span>${user.chats || 0} chats</span>`)}
        </div>
      </div>
    `;
  } catch (err) {
    analyticsContent.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderAnalyticsRows(items = [], mapItem) {
  if (!items.length) return '<div class="empty-state">No data yet</div>';
  return `<div class="analytics-row-list">${items.map(item => `<div class="analytics-row">${mapItem(item)}</div>`).join("")}</div>`;
}

/* ======================
    QUIZ GENERATOR
====================== */
quizBtn?.addEventListener("click", () => {
  quizModal?.classList.remove("hidden");
  quizTopic?.focus();
  hapticFeedback('light');
});

closeQuiz?.addEventListener("click", () => {
  quizModal?.classList.add("hidden");
});

quizModal?.addEventListener("click", (e) => {
  if (e.target.id === "quizModal") quizModal.classList.add("hidden");
});

generateQuizBtn?.addEventListener("click", generateQuiz);

quizTopic?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") generateQuiz();
});

async function generateQuiz() {
  const topic = quizTopic.value.trim();
  if (!topic) {
    showNotification("Enter a topic first", "alert-circle");
    return;
  }

  quizContent.innerHTML = '<div class="quiz-loading"><i data-lucide="loader" class="spin"></i> Building quiz...</div>';
  generateQuizBtn.disabled = true;
  lucide.createIcons();

  try {
    const res = await fetch("/api/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, count: Number(quizCount.value) })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate quiz");

    activeQuiz = data.quiz;
    renderQuiz(activeQuiz);
  } catch (err) {
    quizContent.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  } finally {
    generateQuizBtn.disabled = false;
    lucide.createIcons();
  }
}

function renderQuiz(quiz) {
  quizContent.innerHTML = `
    <div class="quiz-summary">
      <div>
        <span class="quiz-summary-label">Topic</span>
        <strong>${escapeHtml(quiz.topic || "Practice Quiz")}</strong>
      </div>
      <div>
        <span class="quiz-summary-label">Questions</span>
        <strong>${quiz.questions.length}</strong>
      </div>
      <div>
        <span class="quiz-summary-label">Storage</span>
        <strong>Not saved</strong>
      </div>
    </div>
    <form id="quizForm" class="quiz-form">
      ${quiz.questions.map((question, qIndex) => `
        <fieldset class="quiz-question">
          <legend class="quiz-question-head">
            <span class="quiz-number">Q${qIndex + 1}</span>
            <span class="question-text">${escapeHtml(question.question)}</span>
          </legend>
          <div class="quiz-options">
          ${question.options.map((option, oIndex) => `
            <label class="quiz-option">
              <input type="radio" name="q${qIndex}" value="${oIndex}">
              <span class="option-letter">${String.fromCharCode(65 + oIndex)}</span>
              <span class="option-text">${escapeHtml(option)}</span>
            </label>
          `).join("")}
          </div>
          <div class="quiz-explanation hidden" id="explain-${qIndex}"></div>
        </fieldset>
      `).join("")}
      <div class="quiz-actions">
        <button class="modal-btn secondary" id="resetQuizBtn" type="button">Clear</button>
        <button class="modal-btn primary-gradient" type="submit">Submit Quiz</button>
      </div>
      <div id="quizResult" class="quiz-result hidden"></div>
    </form>
  `;

  document.getElementById("quizForm")?.addEventListener("submit", gradeQuiz);
  document.getElementById("resetQuizBtn")?.addEventListener("click", () => renderQuiz(activeQuiz));
}

function gradeQuiz(e) {
  e.preventDefault();
  if (!activeQuiz) return;

  let score = 0;
  activeQuiz.questions.forEach((question, qIndex) => {
    const selected = document.querySelector(`input[name="q${qIndex}"]:checked`);
    const selectedIndex = selected ? Number(selected.value) : -1;
    const isCorrect = selectedIndex === question.answerIndex;
    if (isCorrect) score += 1;

    document.querySelectorAll(`input[name="q${qIndex}"]`).forEach(input => {
      const optionLabel = input.closest(".quiz-option");
      optionLabel.classList.toggle("correct", Number(input.value) === question.answerIndex);
      optionLabel.classList.toggle("wrong", input.checked && !isCorrect);
      input.disabled = true;
    });

    const questionEl = document.querySelectorAll(".quiz-question")[qIndex];
    questionEl?.classList.toggle("answered-correct", isCorrect);
    questionEl?.classList.toggle("answered-wrong", selectedIndex !== -1 && !isCorrect);
    questionEl?.classList.toggle("unanswered", selectedIndex === -1);

    const explanation = document.getElementById(`explain-${qIndex}`);
    if (explanation) {
      explanation.classList.remove("hidden");
      const answerText = question.options[question.answerIndex] || "";
      explanation.innerHTML = `<strong>Correct answer:</strong> ${escapeHtml(answerText)}<br>${escapeHtml(question.explanation || "Review the highlighted correct answer.")}`;
    }
  });

  const result = document.getElementById("quizResult");
  const total = activeQuiz.questions.length;
  const percent = Math.round((score / total) * 100);
  result.classList.remove("hidden");
  result.innerHTML = `
    <span>Your Marks</span>
    <strong>${score}/${total}</strong>
    <em>${percent}%</em>
  `;
  showNotification(`Quiz submitted: ${score}/${total}`, "check-circle");
}

/* ======================
    THEME & AUTO-GROW
====================== */
if (localStorage.getItem("theme") === "light") {
  document.body.classList.add("light");
  themeToggle.innerHTML = '<i data-lucide="sun"></i><span class="sidebar-label">Mode</span>';
} else {
  themeToggle.innerHTML = '<i data-lucide="moon"></i><span class="sidebar-label">Mode</span>';
}

themeToggle.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light");
  themeToggle.innerHTML = (isLight ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>') + '<span class="sidebar-label">Mode</span>';
  localStorage.setItem("theme", isLight ? "light" : "dark");
  lucide.createIcons();
});

menuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!sidebarEl) return;
  const isMobile = window.innerWidth <= 640;
  hapticFeedback('light');
  if (isMobile) {
    const open = sidebarEl.classList.toggle("open");
    sidebarBackdrop?.classList.toggle("visible", open);
    document.body.style.overflow = open ? "hidden" : "auto";
  } else {
    sidebarEl.classList.toggle("collapsed");
  }
  lucide.createIcons();
});

sidebarBackdrop?.addEventListener("click", () => {
  sidebarEl?.classList.remove("open");
  sidebarBackdrop?.classList.remove("visible");
  document.body.style.overflow = "auto";
});

function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 380) + "px";
}
autoGrow(promptInput);
promptInput.addEventListener("input", () => autoGrow(promptInput));

resetBtn?.addEventListener("click", async () => {
  hapticFeedback('heavy');
  promptInput.value = "";
  autoGrow(promptInput);
  imageInput.value = "";
  uploadedImage = null;
  uploadStatus.textContent = "";
  chatHistory.innerHTML = "";
  hasInteracted = false;
  currentChatId = null;
  document.body.classList.remove("post-first");
  await fetch("/reset", { method: "POST" }).catch(() => {});
  clearImage();
  fetchHistory(); // Refresh history
});

/* ======================
    IMAGE HANDLING
====================== */
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  uploadedImage = file;
  const reader = new FileReader();
  reader.onload = (event) => {
    imagePreview.src = event.target.result;
    imagePreviewContainer.classList.remove("hidden");
    uploadStatus.innerHTML = `<i data-lucide="check-circle"></i> ${escapeHtml(file.name)}`;
    lucide.createIcons();
  };
  reader.readAsDataURL(file);
});

removeImageBtn.addEventListener("click", clearImage);

function clearImage() {
  imageInput.value = "";
  uploadedImage = null;
  imagePreviewContainer.classList.add("hidden");
  imagePreview.src = "";
  uploadStatus.textContent = "";
}

document.querySelector('.upload-btn')?.addEventListener('click', () => hapticFeedback('light'));

/* ======================
    SOLVE
====================== */
let currentAbortController = null;
let isTyping = false;
let isCancelled = false;
let typingTimeout = null;
let lastSolveTime = 0;

function cancelCurrentGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  isCancelled = true;
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
  isTyping = false;
  
  solveBtn.innerHTML = '<i data-lucide="sparkles"></i><span> Solve</span>';
  solveBtn.disabled = false;
  lucide.createIcons();
  
  if (currentAnswerEl) {
    currentAnswerEl.innerHTML += "<br><br><em>[Cancelled by user]</em>";
  }
}

solveBtn.addEventListener("click", async () => {
  const prompt = promptInput.value.trim();
  const now = Date.now();

  if (currentAbortController || isTyping) {
    // Prevent accidental double-clicks from instantly cancelling the request
    if (now - lastSolveTime < 500 && !prompt && !uploadedImage) {
      return;
    }
    cancelCurrentGeneration();
    // If no new prompt is provided, they just wanted to stop the current generation
    if (!prompt && !uploadedImage) {
      return;
    }
  } else {
    if (!prompt && !uploadedImage) return;
  }

  lastSolveTime = Date.now();
  hapticFeedback('light');

  const userBubble = document.createElement("div");
  userBubble.className = "chat-bubble user";
  setUserPrompt(userBubble, prompt);
  chatHistory.appendChild(userBubble);

  const aiBubble = document.createElement("div");
  aiBubble.className = "chat-bubble ai";
  
  const bubbleHeader = document.createElement("div");
  bubbleHeader.className = "bubble-header";
  bubbleHeader.innerHTML = '<i data-lucide="bot" class="ai-icon"></i>';
  
  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.innerHTML = '<i data-lucide="copy"></i>';
  copyBtn.title = "Copy Answer";
  
  const ansDiv = document.createElement("div");
  ansDiv.className = "answer-text";
  ansDiv.innerHTML = '<div><i data-lucide="loader" class="spin"></i> Shniro is thinking...</div>';
  
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(ansDiv.innerText);
    copyBtn.innerHTML = '<i data-lucide="check"></i>';
    hapticFeedback('light');
    setTimeout(() => {
      copyBtn.innerHTML = '<i data-lucide="copy"></i>';
      lucide.createIcons();
    }, 2000);
    lucide.createIcons();
  };
  
  aiBubble.appendChild(bubbleHeader);
  aiBubble.appendChild(ansDiv);
  aiBubble.appendChild(copyBtn);
  chatHistory.appendChild(aiBubble);
  currentAnswerEl = ansDiv;
  lucide.createIcons();

  hasInteracted = true;
  if (!document.body.classList.contains("post-first")) {
    document.body.classList.add("post-first");
  }
  chatHistory.scrollTo({ top: chatHistory.scrollHeight, behavior: 'smooth' });

  promptInput.value = "";
  autoGrow(promptInput);
  
  solveBtn.innerHTML = '<i data-lucide="square"></i><span> Stop</span>';
  lucide.createIcons();
  isCancelled = false;
  currentAbortController = new AbortController();

  try {
    const formData = new FormData();
    formData.append("prompt", prompt);
    if (currentChatId) formData.append("chatId", currentChatId);
    if (uploadedImage) formData.append("image", uploadedImage);

    const res = await fetch("/solve", { 
        method: "POST", 
        body: formData,
        signal: currentAbortController.signal 
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.answer || data.error || "Failed to generate answer");
    
    if (!isCancelled) {
      if (data.chatId) currentChatId = data.chatId;
      displayAnswer(data.answer, data.isImage, data.imageUrl);
      fetchHistory(); // Refresh history with new item
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('Fetch aborted');
    } else {
      currentAnswerEl.textContent = err.message || "Error connecting to Shniro.";
      showNotification("Failed to get answer. Please try again.", "alert-circle");
    }
  } finally {
    currentAbortController = null;
    if (!isTyping && !isCancelled) {
      solveBtn.innerHTML = '<i data-lucide="sparkles"></i><span> Solve</span>';
      lucide.createIcons();
    }
    clearImage();
  }
});

function displayAnswer(text, isImage = false, imageUrl = null) {
  currentAnswerEl.innerHTML = "";
  typeWriter(text, true, isImage, imageUrl);
}

function typeWriter(text, rich = false, isImage = false, imageUrl = null) {
  let i = 0;
  const cleanText = text || "";
  const target = currentAnswerEl;
  const typingSpeed = 8;
  let lastRenderTime = 0;
  
  isTyping = true;

  function type() {
    if (isCancelled) {
      isTyping = false;
      return;
    }
    if (i < cleanText.length) {
      i += Math.max(1, Math.ceil(cleanText.length / 240));
      const now = performance.now();
      const shouldRender = i >= cleanText.length || cleanText[i - 1] === "\n" || now - lastRenderTime > 48;
      if (shouldRender) {
        target.innerHTML = renderSafeMarkdown(cleanText.substring(0, i));
        lastRenderTime = now;
      }
      
      // Smooth scroll only if near bottom
      const threshold = 100;
      const isNearBottom = chatHistory.scrollHeight - chatHistory.scrollTop - chatHistory.clientHeight < threshold;
      if (isNearBottom) {
        chatHistory.scrollTo({
          top: chatHistory.scrollHeight,
          behavior: 'smooth'
        });
      }

      typingTimeout = setTimeout(type, typingSpeed);
    } else {
      isTyping = false;
      target.innerHTML = renderSafeMarkdown(cleanText);
      renderRichContent(target);
      if (!currentAbortController) {
          solveBtn.innerHTML = '<i data-lucide="sparkles"></i><span> Solve</span>';
          lucide.createIcons();
      }
      if (isImage && imageUrl) renderImageDownload(imageUrl, target);
      // Final scroll check
      chatHistory.scrollTo({ top: chatHistory.scrollHeight, behavior: 'smooth' });
    }
  }
  type();
}

function renderImageDownload(url, targetEl) {
  const container = document.createElement("div");
  container.className = "image-download-container";
  container.style.cssText = "margin-top: 20px; display: flex; flex-direction: column; align-items: center; gap: 10px;";
  
  const img = document.createElement("img");
  img.src = url;
  img.style.cssText = "max-width: 100%; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);";
  
  const dl = document.createElement("button");
  dl.innerHTML = '<i data-lucide="download"></i> Download';
  dl.className = "solve-btn";
  dl.onclick = () => {
    window.open(`/proxy-image?url=${encodeURIComponent(url)}`, "_blank");
    showNotification("Opening download link...", "download");
  };

  container.appendChild(img);
  container.appendChild(dl);
  targetEl.appendChild(container);
  lucide.createIcons();
}

function renderRichContent(targetEl) {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(targetEl, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false }
      ]
    });
  }

  // Add copy buttons to code blocks
  const codeBlocks = targetEl.querySelectorAll('pre');
  codeBlocks.forEach((block) => {
    // Check if copy button already exists
    if (block.querySelector('.code-copy-btn')) return;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-copy-btn';
    copyBtn.title = 'Copy code';
    copyBtn.innerHTML = '<i data-lucide="copy"></i>';
    
    copyBtn.onclick = (e) => {
      e.preventDefault();
      const codeText = block.innerText;
      navigator.clipboard.writeText(codeText);
      
      copyBtn.innerHTML = '<i data-lucide="check"></i>';
      hapticFeedback('light');
      
      setTimeout(() => {
        copyBtn.innerHTML = '<i data-lucide="copy"></i>';
        lucide.createIcons();
      }, 2000);
    };
    
    block.appendChild(copyBtn);
    lucide.createIcons();
  });
}

/* ======================
    SCROLL INTERACTION
====================== */
window.addEventListener("scroll", () => {
  if (!hasInteracted) return;
  
  if (window.scrollY > 50) {
    document.body.classList.add("post-first");
  } else {
    document.body.classList.remove("post-first");
  }
});

promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    solveBtn.click();
  }
});
