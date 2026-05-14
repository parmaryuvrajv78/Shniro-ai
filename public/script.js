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

let currentUser = null;
let uploadedImage = null;
let displayMode = "rich";
let currentAnswerEl = null; // tracks the active answer div for typing
let hasInteracted = false; // tracks if the user has sent at least one prompt

/* ======================
    NATIVE FEEL HELPERS
====================== */
function hapticFeedback(type = 'light') {
  if (!window.navigator || !window.navigator.vibrate) return;
  if (type === 'light') window.navigator.vibrate(10);
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
  checkAuth();
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
  promptInput.value = "";
  autoGrow(promptInput);
  imageInput.value = "";
  uploadedImage = null;
  uploadStatus.textContent = "";
  chatHistory.innerHTML = "";
  hasInteracted = false;
  document.body.classList.remove("post-first");
  await fetch("/reset", { method: "POST" }).catch(() => {});
});

/* ======================
    IMAGE UPLOAD
====================== */
document.querySelector('.upload-btn')?.addEventListener('click', () => hapticFeedback('light'));

imageInput.addEventListener("change", () => {
  if (imageInput.files.length > 0) {
    uploadedImage = imageInput.files[0];
    uploadStatus.innerHTML = `<i data-lucide="check-circle"></i> ${uploadedImage.name}`;
    lucide.createIcons();
  }
});

/* ======================
/* ======================
    SOLVE
====================== */
solveBtn.addEventListener("click", async () => {
  hapticFeedback('light');
  const prompt = promptInput.value.trim();
  if (!prompt && !uploadedImage) return;

  const userBubble = document.createElement("div");
  userBubble.className = "chat-bubble user";
  userBubble.innerHTML = `<div class="user-prompt">${prompt || "(Image)"}</div>`;
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
  
  const ansDiv = document.createElement("div");
  ansDiv.className = "answer-text";
  ansDiv.innerHTML = '<div><i data-lucide="loader" class="spin"></i> Shniro is thinking...</div>';
  
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
  solveBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("prompt", prompt);
    if (uploadedImage) formData.append("image", uploadedImage);

    const res = await fetch("/solve", { method: "POST", body: formData });
    const data = await res.json();
    displayAnswer(data.answer, data.isImage, data.imageUrl);
  } catch (err) {
    currentAnswerEl.textContent = "❌ Error connecting to Shniro.";
  } finally {
    solveBtn.disabled = false;
    uploadedImage = null;
    imageInput.value = "";
    uploadStatus.textContent = "";
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
  const typingSpeed = 12; // Adjusted for smoothness

  function type() {
    if (i < cleanText.length) {
      target.innerHTML = marked.parse(cleanText.substring(0, i + 1));
      renderRichContent(target);
      i++;
      
      // Smooth scroll only if near bottom
      const threshold = 100;
      const isNearBottom = chatHistory.scrollHeight - chatHistory.scrollTop - chatHistory.clientHeight < threshold;
      if (isNearBottom) {
        chatHistory.scrollTo({
          top: chatHistory.scrollHeight,
          behavior: 'smooth'
        });
      }

      setTimeout(type, typingSpeed);
    } else {
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
  dl.onclick = () => window.open(`/proxy-image?url=${encodeURIComponent(url)}`, "_blank");

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
