document.addEventListener("DOMContentLoaded", () => {
  const authGate = document.getElementById("authGate");
  const authForm = document.getElementById("authForm");
  const authPasswordInput = document.getElementById("authPasswordInput");
  const authError = document.getElementById("authError");
  const authSubmitBtn = document.getElementById("authSubmitBtn");
  const appContent = document.getElementById("appContent");
  const logoutBtn = document.getElementById("logoutBtn");

  const pwaInstallBanner = document.getElementById("pwaInstallBanner");
  const pwaBannerDesc = document.getElementById("pwaBannerDesc");
  const pwaInstallBtn = document.getElementById("pwaInstallBtn");
  const pwaLaterBtn = document.getElementById("pwaLaterBtn");

  // PWA 서비스 워커 등록
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  // PWA 설치 안내 (안드로이드 크롬 + 아이폰 사파리)
  const PWA_DISMISS_KEY = "uswPwaInstallDismissedUntil";
  let deferredInstallPrompt = null;

  function isStandaloneMode() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isDismissedRecently() {
    try {
      const until = Number(localStorage.getItem(PWA_DISMISS_KEY) || "0");
      return Date.now() < until;
    } catch (e) {
      return false;
    }
  }

  function isIosSafari() {
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    return isIos && isSafari;
  }

  function showPwaBanner(mode) {
    if (isStandaloneMode() || isDismissedRecently()) return;
    if (mode === "ios") {
      pwaBannerDesc.textContent = "하단 공유 버튼(□↑)을 누른 뒤 '홈 화면에 추가'를 선택해 설치하세요.";
      pwaInstallBtn.classList.add("hidden");
    } else {
      pwaBannerDesc.textContent = "홈 화면에 추가하면 앱처럼 바로 열 수 있습니다.";
      pwaInstallBtn.classList.remove("hidden");
    }
    pwaInstallBanner.classList.remove("hidden");
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showPwaBanner("android");
  });

  if (isIosSafari() && !isStandaloneMode()) {
    setTimeout(() => showPwaBanner("ios"), 1200);
  }

  pwaInstallBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (result && result.outcome === "accepted") {
      pwaInstallBanner.classList.add("hidden");
    }
  });

  pwaLaterBtn.addEventListener("click", () => {
    pwaInstallBanner.classList.add("hidden");
    try {
      // '나중에' 클릭 시 7일간 다시 띄우지 않음
      localStorage.setItem(PWA_DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch (e) {}
  });

  // 접속 비밀번호 인증 처리
  function showAuthError(message) {
    authError.textContent = message;
    authError.classList.remove("hidden");
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authError.classList.add("hidden");
    const password = authPasswordInput.value.trim();

    if (password.length < 8) {
      showAuthError("비밀번호는 8자리 이상 입력해 주세요.");
      authPasswordInput.focus();
      return;
    }

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = "확인 중...";

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();

      if (!response.ok) {
        showAuthError(data.error || "비밀번호 확인에 실패했습니다.");
        return;
      }

      authPasswordInput.value = "";
      authGate.classList.add("hidden");
      appContent.classList.remove("hidden");
      logoutBtn.classList.remove("hidden");
    } catch (error) {
      showAuthError("서버와 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = "잠금 해제";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch (e) {}
    appContent.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    authGate.classList.remove("hidden");
    authPasswordInput.focus();
  });

  const form = document.getElementById("draftForm");
  const docTypeInput = document.getElementById("docType");
  const titleInput = document.getElementById("title");
  const factDateTimeInput = document.getElementById("factDateTime");
  const factLocationInput = document.getElementById("factLocation");
  const factTargetInput = document.getElementById("factTarget");
  const factApplyInput = document.getElementById("factApply");
  const factContactInput = document.getElementById("factContact");
  const recipientInput = document.getElementById("recipient");
  const toneInput = document.getElementById("tone");

  const generateBtn = document.getElementById("generateBtn");
  const fillSampleBtn = document.getElementById("fillSampleBtn");
  const saveFactsBtn = document.getElementById("saveFactsBtn");
  const loadFactsBtn = document.getElementById("loadFactsBtn");
  const factsStorageMsg = document.getElementById("factsStorageMsg");
  const copyBtn = document.getElementById("copyBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const errorMessage = document.getElementById("errorMessage");
  const statusMessage = document.getElementById("statusMessage");
  const previewTabBtn = document.getElementById("previewTabBtn");
  const editTabBtn = document.getElementById("editTabBtn");
  const resultPreview = document.getElementById("resultPreview");
  const resultEditor = document.getElementById("resultEditor");

  let currentDraft = "";
  let activeTab = "preview";
  const FACTS_STORAGE_KEY = "docDraftBuilderFacts";

  function showFactsMessage(message) {
    factsStorageMsg.textContent = message;
    factsStorageMsg.classList.remove("hidden");
    setTimeout(() => {
      factsStorageMsg.classList.add("hidden");
    }, 3000);
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatInlineMarkdown(escapedLine) {
    return escapedLine
      .replace(/\[확인 필요\]/g, '<span class="needs-check">[확인 필요]</span>')
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  function renderMarkdown(markdownText) {
    if (!markdownText.trim()) {
      return '<p class="placeholder-text">여기에 생성된 문서 초안이 보기 좋게 표시됩니다.</p>';
    }

    const lines = markdownText.replace(/\r\n/g, "\n").split("\n");
    const htmlParts = [];
    let listType = null;

    function closeList() {
      if (listType) {
        htmlParts.push(`</${listType}>`);
        listType = null;
      }
    }

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (!trimmed) {
        closeList();
        continue;
      }

      if (/^---+$/.test(trimmed)) {
        closeList();
        htmlParts.push("<hr />");
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        closeList();
        const level = headingMatch[1].length;
        const content = formatInlineMarkdown(escapeHtml(headingMatch[2]));
        htmlParts.push(`<h${level}>${content}</h${level}>`);
        continue;
      }

      const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (ulMatch) {
        if (listType !== "ul") {
          closeList();
          listType = "ul";
          htmlParts.push("<ul>");
        }
        htmlParts.push(`<li>${formatInlineMarkdown(escapeHtml(ulMatch[1]))}</li>`);
        continue;
      }

      const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (listType !== "ol") {
          closeList();
          listType = "ol";
          htmlParts.push("<ol>");
        }
        htmlParts.push(`<li>${formatInlineMarkdown(escapeHtml(olMatch[1]))}</li>`);
        continue;
      }

      const quoteMatch = trimmed.match(/^>\s+(.+)$/);
      if (quoteMatch) {
        closeList();
        htmlParts.push(`<blockquote>${formatInlineMarkdown(escapeHtml(quoteMatch[1]))}</blockquote>`);
        continue;
      }

      closeList();
      htmlParts.push(`<p>${formatInlineMarkdown(escapeHtml(trimmed))}</p>`);
    }

    closeList();
    return htmlParts.join("\n");
  }

  function updateResultViews(text) {
    currentDraft = text;
    resultEditor.value = text;
    resultPreview.innerHTML = renderMarkdown(text);
    const hasContent = text.trim().length > 0;
    copyBtn.disabled = !hasContent;
    downloadBtn.disabled = !hasContent;
  }

  function switchTab(mode) {
    activeTab = mode;
    if (mode === "edit") {
      previewTabBtn.classList.remove("active");
      editTabBtn.classList.add("active");
      resultPreview.classList.add("hidden");
      resultEditor.classList.remove("hidden");
      resultEditor.focus();
    } else {
      editTabBtn.classList.remove("active");
      previewTabBtn.classList.add("active");
      resultEditor.classList.add("hidden");
      resultPreview.classList.remove("hidden");
      resultPreview.innerHTML = renderMarkdown(currentDraft);
    }
  }

  previewTabBtn.addEventListener("click", () => switchTab("preview"));
  editTabBtn.addEventListener("click", () => switchTab("edit"));

  resultEditor.addEventListener("input", () => {
    currentDraft = resultEditor.value;
    const hasContent = currentDraft.trim().length > 0;
    copyBtn.disabled = !hasContent;
    downloadBtn.disabled = !hasContent;
  });

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");
  }

  function clearError() {
    errorMessage.textContent = "";
    errorMessage.classList.add("hidden");
  }

  function showStatus(message) {
    statusMessage.textContent = message;
    statusMessage.classList.remove("hidden");
    setTimeout(() => {
      statusMessage.classList.add("hidden");
    }, 3000);
  }

  function setLoading(isLoading) {
    generateBtn.disabled = isLoading;
    if (isLoading) {
      generateBtn.textContent = "생성 중...";
      loadingIndicator.classList.remove("hidden");
      copyBtn.disabled = true;
      downloadBtn.disabled = true;
    } else {
      generateBtn.textContent = "초안 생성";
      loadingIndicator.classList.add("hidden");
    }
  }

  fillSampleBtn.addEventListener("click", () => {
    clearError();
    docTypeInput.value = "안내문";
    titleInput.value = "2026학년도 2학기 교직원 AI 업무 활용 특강 안내";
    factDateTimeInput.value = "2026. 11. 25.(수) 14:00~16:00";
    factLocationInput.value = "본관 3층 대회의실";
    factTargetInput.value = "전 교직원";
    factApplyInput.value = "대학 포털 시스템 온라인 신청";
    factContactInput.value = "총무과 홍길동 주무관 (내선 1234)";
    recipientInput.value = "전체 단과대학 및 본부 부서 행정실";
    toneInput.value = "공식적";
  });

  saveFactsBtn.addEventListener("click", () => {
    const facts = {
      date_time: factDateTimeInput.value.trim(),
      location: factLocationInput.value.trim(),
      target: factTargetInput.value.trim(),
      how_to_apply: factApplyInput.value.trim(),
      contact: factContactInput.value.trim(),
    };
    try {
      localStorage.setItem(FACTS_STORAGE_KEY, JSON.stringify(facts));
      showFactsMessage("핵심 사실 카드를 브라우저에 저장했습니다.");
    } catch (error) {
      showFactsMessage("브라우저 저장 공간에 저장하지 못했습니다.");
    }
  });

  loadFactsBtn.addEventListener("click", () => {
    try {
      const saved = localStorage.getItem(FACTS_STORAGE_KEY);
      if (!saved) {
        showFactsMessage("저장된 핵심 사실 카드가 없습니다.");
        return;
      }
      const facts = JSON.parse(saved);
      factDateTimeInput.value = facts.date_time || "";
      factLocationInput.value = facts.location || "";
      factTargetInput.value = facts.target || "";
      factApplyInput.value = facts.how_to_apply || "";
      factContactInput.value = facts.contact || "";
      showFactsMessage("저장된 핵심 사실 카드를 불러왔습니다.");
    } catch (error) {
      showFactsMessage("저장된 내용을 불러오는 데 실패했습니다.");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const docType = docTypeInput.value.trim();
    const title = titleInput.value.trim();

    // 화면 측 필수 입력 검사
    if (!docType && !title) {
      showError("문서 종류를 선택하고 제목을 입력해 주세요.");
      docTypeInput.focus();
      return;
    }
    if (!docType) {
      showError("문서 종류를 선택해 주세요.");
      docTypeInput.focus();
      return;
    }
    if (!title) {
      showError("제목을 입력해 주세요.");
      titleInput.focus();
      return;
    }

    const selectedPrompt = document.querySelector('input[name="promptType"]:checked');
    const promptType = selectedPrompt ? selectedPrompt.value : "A";

    const payload = {
      doc_type: docType,
      title: title,
      facts: {
        date_time: factDateTimeInput.value.trim(),
        location: factLocationInput.value.trim(),
        target: factTargetInput.value.trim(),
        how_to_apply: factApplyInput.value.trim(),
        contact: factContactInput.value.trim(),
      },
      recipient: recipientInput.value.trim(),
      tone: toneInput.value.trim(),
      prompt_type: promptType,
    };

    setLoading(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        showError(data.error || "문서 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
        if (currentDraft) {
          copyBtn.disabled = false;
          downloadBtn.disabled = false;
        }
        return;
      }

      updateResultViews(data.draft || "");
    } catch (error) {
      showError("서버와 통신하는 데 실패했습니다. 서버가 켜져 있는지 확인해 주세요.");
      if (currentDraft) {
        copyBtn.disabled = false;
        downloadBtn.disabled = false;
      }
    } finally {
      setLoading(false);
    }
  });

  copyBtn.addEventListener("click", async () => {
    if (!currentDraft) return;
    const textToCopy =
      activeTab === "preview"
        ? resultPreview.innerText.trim()
        : currentDraft;
    try {
      await navigator.clipboard.writeText(textToCopy);
      if (activeTab === "preview") {
        showStatus("마크다운 기호 없는 깔끔한 본문이 복사되었습니다. 한글/워드/메일에 바로 붙여넣으세요.");
      } else {
        showStatus("마크다운 원문이 클립보드에 복사되었습니다.");
      }
    } catch (error) {
      showError("복사에 실패했습니다. 결과 글자를 직접 드래그해서 복사해 주세요.");
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!currentDraft) return;
    const rawTitle = titleInput.value.trim() || "문서초안";
    const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "_");
    const fileName = `${safeTitle}.md`;

    const blob = new Blob([currentDraft], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showStatus(`'${fileName}' 파일로 다운로드되었습니다.`);
  });
});
