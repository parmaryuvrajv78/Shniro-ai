/* ======================
    CORE VARIABLES
====================== */
const themeToggle = document.getElementById("themeToggle");
const solveBtn = document.getElementById("solveBtn");
const outputContent = document.getElementById("outputContent");
const answerText = document.getElementById("answerText");
const imageInput = document.getElementById("imageInput");
const uploadStatus = document.getElementById("uploadStatus");
const promptInput = document.getElementById("prompt");

let uploadedImage = null;
let displayMode = "rich";

/* ======================
    THEME & AUTO-GROW
====================== */
if (localStorage.getItem("theme") === "light") {
  document.body.classList.add("light");
  themeToggle.textContent = "☀️";
} else {
  themeToggle.textContent = "🌙";
}

themeToggle.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light");
  themeToggle.textContent = isLight ? "☀️" : "🌙";
  localStorage.setItem("theme", isLight ? "light" : "dark");
});

function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 380) + "px";
}
autoGrow(promptInput);
promptInput.addEventListener("input", () => autoGrow(promptInput));

/* ======================
    IMAGE UPLOAD
====================== */
imageInput.addEventListener("change", () => {
  if (imageInput.files.length > 0) {
    uploadedImage = imageInput.files[0];
    uploadStatus.textContent = `✅ ${uploadedImage.name}`;
  }
});

/* ======================
    SOLVE (WITH LOADER)
====================== */
solveBtn.addEventListener("click", async () => {
  const prompt = promptInput.value.trim();
  if (!prompt && !uploadedImage) {
    answerText.textContent = "⚠️ Please enter a question or upload an image.";
    return;
  }

  answerText.innerHTML = "<span>⏳ Shniro is thinking...</span>";
  solveBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("prompt", prompt);
    if (uploadedImage) formData.append("image", uploadedImage);

    const res = await fetch("/solve", {
      method: "POST",
      body: formData
    });


    const data = await res.json();
    const answer = data.answer || data.result || data.output || data.text;

    if (!answer) {
      answerText.textContent = "⚠️ No answer received.";
      return;
    }

    displayAnswer(answer);
  } catch (err) {
    console.error(err);
    answerText.textContent = "❌ Server error.";
  } finally {
    solveBtn.disabled = false;
  }
});

/* ======================
    DISPLAY ANSWER
====================== */
function displayAnswer(text) {
  answerText.innerHTML = "";
  typeWriter(text, displayMode === "rich");
}

/* ======================
    IMPROVED TYPING EFFECT
====================== */
function typeWriter(text, rich = false) {
  let i = 0;
  // We clean the text of common AI spacing issues first
  const cleanText = text.replace(/\\n/g, '\n');

  function type() {
    if (i < cleanText.length) {
      // Append character
      const currentText = cleanText.substring(0, i + 1);

      if (rich) {
        // Render Markdown every few characters so it doesn't look like a wall
        answerText.innerHTML = marked.parse(currentText);
        renderRichContent();
      } else {
        answerText.innerText = currentText;
      }

      i++;
      answerText.scrollTop = answerText.scrollHeight;
      setTimeout(type, 10);
    } else if (rich) {
      // Final render to ensure everything is perfect
      renderRichContent();
    }
  }
  type();
}

/* ======================
    STRUCTURED RENDERING (CLEAN LOOK)
====================== */
function renderRichContent() {
  try {
    // 1. Math Rendering
    if (typeof renderMathInElement === 'function') {
      renderMathInElement(answerText, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ]
      });
    }

    // 2. APPLYING THE "CHATGPT" STYLE (Spacing & Hierarchy)
    // Paragraph Spacing
    answerText.querySelectorAll("p").forEach(p => {
      p.style.cssText = "margin-bottom: 1.5rem; line-height: 1.7; display: block;";
    });

    // Heading Spacing
    answerText.querySelectorAll("h1, h2, h3").forEach(h => {
      h.style.cssText = "margin-top: 1.5rem; margin-bottom: 0.8rem; font-weight: bold; display: block;";
    });

    // List & Bullet Spacing
    answerText.querySelectorAll("ul, ol").forEach(list => {
      list.style.cssText = "margin-bottom: 1.5rem; padding-left: 1.5rem; display: block;";
    });

    answerText.querySelectorAll("li").forEach(li => {
      li.style.cssText = "margin-bottom: 0.6rem; line-height: 1.6; display: list-item;";
    });

    // 3. Code Block Copy Buttons
    const codeBlocks = answerText.querySelectorAll("pre");
    codeBlocks.forEach((block) => {
      if (block.querySelector(".copy-btn")) return; // Prevent duplicate buttons

      const copyBtn = document.createElement("button");
      copyBtn.innerText = "Copy Code";
      copyBtn.className = "copy-btn";
      copyBtn.style.cssText = "float:right; cursor:pointer; font-size:11px; padding:3px 8px; border-radius:4px; border:none; background:rgba(255,255,255,0.2); color:inherit;";

      copyBtn.onclick = () => {
        const codeText = block.querySelector("code") ? block.querySelector("code").innerText : block.innerText;
        navigator.clipboard.writeText(codeText);
        copyBtn.innerText = "Copied!";
        setTimeout(() => copyBtn.innerText = "Copy Code", 2000);
      };

      block.prepend(copyBtn);
      block.style.cssText = "background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; overflow-x: auto; clear: both; margin: 10px 0;";
    });

  } catch (e) {
    console.warn("Render error:", e);
  }
}

window.setDisplayMode = mode => {
  displayMode = mode;
};