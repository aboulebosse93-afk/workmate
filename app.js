// ============================================================
// WorkMate AI — app.js
// Firebase Auth + Firestore + IA centrale via /api/ai
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyClJGReIQ3s2h18HST8r6PmayeBSGJX_zw",
  authDomain: "workmate-3c68c.firebaseapp.com",
  projectId: "workmate-3c68c",
  storageBucket: "workmate-3c68c.firebasestorage.app",
  messagingSenderId: "106648534705",
  appId: "1:106648534705:web:79c1af55ebf3dbe7972c90"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/gmail.readonly");

let currentUser = null;
let userProfile = null;
let gmailAccessToken = localStorage.getItem("gmail_token") || null;
const tasks = [];
const assistantHistory = [];

const DEFAULT_APP_SETTINGS = {
  workspaceName: "Espace de travail",
  theme: "dark",
  language: "fr",
  tone: "professional",
  gmailQuery: "in:inbox newer_than:30d",
  gmailMax: "200"
};

const STORAGE_KEYS = {
  conversations: "workmate_conversations",
  currentConversation: "workmate_current_conversation",
  documents: "workmate_documents",
  actions: "workmate_actions"
};

let lastGmailEmails = [];
let pendingChatAttachments = [];

// ============================================================
// HELPERS
// ============================================================

const $ = (id) => document.getElementById(id);

function safeSetText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function safeSetValue(id, value) {
  const el = $(id);
  if (el) el.value = value || "";
}

function getAppSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("workmate_settings") || "{}");
    return { ...DEFAULT_APP_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function saveSettingsToLocal(settings) {
  localStorage.setItem("workmate_settings", JSON.stringify(settings));
}

function showMessage(id, text, success = true) {
  const msg = $(id);
  if (!msg) return;

  msg.textContent = text;
  msg.style.color = success ? "var(--success)" : "var(--danger)";
  msg.style.display = "block";

  setTimeout(() => {
    if (msg) msg.style.display = "none";
  }, 3500);
}

function applyThemePreference(theme) {
  let selectedTheme = theme || getAppSettings().theme || "dark";

  if (selectedTheme === "system") {
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    selectedTheme = prefersLight ? "light" : "dark";
  }

  document.body.classList.toggle("light-mode", selectedTheme === "light");
  localStorage.setItem("theme", selectedTheme);
  safeSetText("theme-icon", selectedTheme === "light" ? "☀️" : "🌙");
}

function applyAppSettings() {
  const settings = getAppSettings();

  safeSetText("workspace-name-sidebar", settings.workspaceName || "Espace de travail");

  const gmailQuery = $("gmail-query");
  const gmailMax = $("gmail-max");

  if (gmailQuery) gmailQuery.value = settings.gmailQuery ?? "in:inbox newer_than:30d";
  if (gmailMax) gmailMax.value = settings.gmailMax ?? "200";

  applyThemePreference(settings.theme);
}

function updateSettingsForm() {
  const settings = getAppSettings();

  safeSetValue("settings-workspace-name", settings.workspaceName);
  safeSetValue("settings-theme", settings.theme);
  safeSetValue("settings-language", settings.language);
  safeSetValue("settings-tone", settings.tone);
  safeSetValue("settings-gmail-query", settings.gmailQuery);
  safeSetValue("settings-gmail-max", settings.gmailMax);
}

function getAssistantPreferencePrompt() {
  const settings = getAppSettings();

  const languageMap = {
    fr: "Réponds en français.",
    en: "Réponds en anglais.",
    auto: "Réponds dans la même langue que l'utilisateur."
  };

  const toneMap = {
    professional: "Adopte un ton professionnel, clair et structuré.",
    simple: "Adopte un ton simple, pédagogique et facile à comprendre.",
    detailed: "Donne des réponses très détaillées, avec étapes et explications.",
    direct: "Sois direct, court et orienté action."
  };

  return `
Préférences utilisateur :
- Nom de l'espace : ${settings.workspaceName || "Espace de travail"}
- Langue : ${languageMap[settings.language] || languageMap.fr}
- Style : ${toneMap[settings.tone] || toneMap.professional}
`;
}


function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function loadingHTML(text = "Analyse en cours...") {
  return `<div class="loading"><span class="spinner"></span><span>${escapeHTML(text)}</span></div>`;
}

function setBtnBusy(id, busy, busyText) {
  const btn = $(id);
  if (!btn) return;

  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.textContent = busyText || "...";
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
}


function downloadTextFile(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]/g, "-");
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "À l'instant";
  if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `Il y a ${days} jour${days > 1 ? "s" : ""}`;
  }
  return date.toLocaleDateString("fr-FR");
}

function translateError(code) {
  const errors = {
    "auth/user-not-found": "Aucun compte avec cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/email-already-in-use": "Cet email est déjà utilisé.",
    "auth/invalid-email": "Email invalide.",
    "auth/weak-password": "Mot de passe trop faible.",
    "auth/requires-recent-login": "Reconnecte-toi pour effectuer cette action.",
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/popup-closed-by-user": "Connexion Google annulée."
  };
  return errors[code] || "Une erreur s'est produite. Réessaie.";
}

// ============================================================
// IA CENTRALE — WORKMATE AI
// ============================================================

const WORKMATE_SYSTEM_PROMPT = `
Tu es WorkMate AI, un assistant intelligent unique, proche de Claude dans l'esprit.

Ton rôle principal :
- aider l'utilisateur dans son travail ;
- analyser des réunions ;
- rédiger des emails ;
- organiser des tâches ;
- trier des informations ;
- expliquer, coder, résumer, conseiller et répondre à toute question générale.

Comportement attendu :
- Tu réponds toujours en français, sauf si l'utilisateur demande une autre langue.
- Tu es clair, utile, professionnel, direct et humain.
- Tu peux répondre à tout type de question, même hors travail.
- Quand la demande est professionnelle, tu donnes une réponse structurée et actionnable.
- Quand l'utilisateur demande du code, tu fournis du code complet et simple à utiliser.
- Quand il y a une décision à prendre, tu proposes la meilleure option et pourquoi.
- Tu ne dis pas que tu es limité à un seul outil : tu es l'assistant central WorkMate.
`;

const WORKMATE_MODES = {
  general: `Mode général. Réponds comme un assistant complet : travail, études, code, organisation, explication, idées, documents, messages, etc.`,
  reunion: `Mode réunion. Analyse les notes comme un assistant de direction. Repère décisions, actions, responsables, deadlines, risques, points flous et prochaines étapes.`,
  email: `Mode email. Aide à rédiger des emails professionnels. Propose un ton clair, humain, diplomatique et orienté solution.`,
  focus: `Mode organisation. Priorise les tâches, découpe le travail, conseille l'ordre d'exécution et donne un plan concret.`,
  gmail: `Mode Gmail. Trie les emails par urgence, importance, action à faire, information simple et éléments à ignorer.`,
  document: `Mode document. Résume, extrait les actions, structure les informations et transforme le contenu en document exploitable.`,
  actions: `Mode actions. Extrais uniquement les tâches concrètes, les priorités, les responsables et les délais.`
};

function getWorkMateModePrompt(mode = "general") {
  return WORKMATE_MODES[mode] || WORKMATE_MODES.general;
}

async function callWorkMateAI(prompt, mode = "general", previousMessages = []) {
  const messages = [
    { role: "system", content: WORKMATE_SYSTEM_PROMPT },
    { role: "system", content: getAssistantPreferencePrompt() },
    { role: "system", content: getWorkMateModePrompt(mode) },
    ...previousMessages,
    { role: "user", content: prompt }
  ];

  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, messages })
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error || "Erreur IA.");
  }

  const answer =
    data?.choices?.[0]?.message?.content ||
    data?.message?.content ||
    data?.content ||
    data?.text;

  if (!answer) {
    throw new Error("Réponse IA vide ou format inconnu.");
  }

  return answer.trim();
}

// Compatibilité avec l'ancien nom dans ton projet.
async function callGroq(prompt, mode = "general") {
  return callWorkMateAI(prompt, mode);
}

// ============================================================
// AUTH STATE
// ============================================================

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserProfile(user);
    showPage("app");
    switchView("dashboard");
    loadDashboard();
  } else {
    try {
      const result = await getRedirectResult(auth);
      if (result?.user) return;
    } catch (error) {
      console.error("Redirect error:", error);
    }

    currentUser = null;
    userProfile = null;
    showPage("landing");
  }
});

async function loadUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    userProfile = snap.data();
  } else {
    userProfile = {
      uid: user.uid,
      email: user.email,
      firstname: user.displayName?.split(" ")[0] || "",
      lastname: user.displayName?.split(" ").slice(1).join(" ") || "",
      plan: "free",
      usage: {
        month: currentMonth(),
        total: 0,
        assistant: 0,
        reunion: 0,
        email: 0,
        focus: 0
      },
      createdAt: serverTimestamp()
    };
    await setDoc(ref, userProfile);
  }

  updateUIWithProfile();
}

function updateUIWithProfile() {
  if (!userProfile) return;

  const name = `${userProfile.firstname || ""} ${userProfile.lastname || ""}`.trim() || userProfile.email;
  const initials = name.slice(0, 2).toUpperCase();
  const usage = userProfile.usage || {};
  const monthUsage = usage.month === currentMonth() ? usage.total || 0 : 0;
  const monthlyLimit = 50;
  const pct = Math.min((monthUsage / monthlyLimit) * 100, 100);

  safeSetText("user-display-name", name);
  safeSetText("user-avatar-initials", initials);
  safeSetText("profile-name", name);
  safeSetText("profile-email", userProfile.email || "");
  safeSetText("profile-avatar", initials);
  safeSetValue("profile-firstname", userProfile.firstname || "");
  safeSetValue("profile-lastname", userProfile.lastname || "");
  safeSetValue("profile-email-input", userProfile.email || "");
  safeSetText("usage-badge", "Accès illimité");

  updateSettingsForm();
  applyAppSettings();
}

async function incrementUsage(type) {
  if (!currentUser) return;

  const ref = doc(db, "users", currentUser.uid);
  const snap = await getDoc(ref);
  const data = snap.data() || {};
  const usage = data.usage || {};
  const isCurrent = usage.month === currentMonth();

  const base = {
    month: currentMonth(),
    total: isCurrent ? usage.total || 0 : 0,
    assistant: isCurrent ? usage.assistant || 0 : 0,
    reunion: isCurrent ? usage.reunion || 0 : 0,
    email: isCurrent ? usage.email || 0 : 0,
    focus: isCurrent ? usage.focus || 0 : 0
  };

  const newUsage = {
    ...base,
    total: base.total + 1,
    [type]: (base[type] || 0) + 1
  };

  await updateDoc(ref, { usage: newUsage });
  userProfile.usage = newUsage;
  updateUIWithProfile();
}

async function saveAnalysis(type, title, summary, content) {
  if (!currentUser) return;

  try {
    await addDoc(collection(db, "analyses"), {
      uid: currentUser.uid,
      type,
      title,
      summary,
      content,
      createdAt: serverTimestamp()
    });
    await incrementUsage(type);
  } catch (error) {
    console.error("Erreur sauvegarde:", error);
  }
}

// ============================================================
// DASHBOARD + HISTORY
// ============================================================

async function loadDashboard() {
  if (!currentUser) return;

  const usage = userProfile?.usage || {};
  const m = usage.month === currentMonth()
    ? usage
    : { total: 0, assistant: 0, reunion: 0, email: 0, focus: 0 };

  safeSetText("stat-total", m.total || 0);
  safeSetText("stat-assistant", m.assistant || 0);
  safeSetText("stat-reunion", m.reunion || 0);
  safeSetText("stat-email", m.email || 0);
  safeSetText("stat-focus", m.focus || 0);

  await loadHistory(5, "recent-list");
  renderDashboardActions();
  renderDashboardConversations();
}

async function loadHistory(limitCount = 50, targetId = "history-list") {
  const target = $(targetId);
  if (!target || !currentUser) return;

  target.innerHTML = loadingHTML("Chargement de l'historique...");

  try {
    // Correction Firebase :
    // Avant, la requête utilisait where("uid") + orderBy("createdAt"),
    // ce qui oblige Firebase à créer un index composé.
    // Maintenant, on récupère les analyses de l'utilisateur puis on trie côté navigateur.
    // Résultat : plus d'erreur "The query requires an index".
    const q = query(
      collection(db, "analyses"),
      where("uid", "==", currentUser.uid)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      target.innerHTML = `<div class="history-item">Aucune analyse pour l'instant.</div>`;
      return;
    }

    const icons = {
      assistant: "🤖",
      reunion: "🎙️",
      email: "✉️",
      focus: "🎯"
    };

    const docs = snap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .sort((a, b) => {
        const dateA = a.data.createdAt?.toDate ? a.data.createdAt.toDate().getTime() : 0;
        const dateB = b.data.createdAt?.toDate ? b.data.createdAt.toDate().getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, limitCount);

    target.innerHTML = docs.map((item) => {
      const data = item.data;
      const date = data.createdAt?.toDate ? timeAgo(data.createdAt.toDate()) : "—";
      const type = data.type || "assistant";

      return `
        <article class="history-item" data-type="${escapeHTML(type)}">
          <div class="history-icon">${icons[type] || "🤖"}</div>
          <div>
            <div class="history-title">${escapeHTML(data.title || "Sans titre")}</div>
            <div class="history-summary">${escapeHTML(data.summary || "")}</div>
            <div class="history-date">${escapeHTML(date)}</div>
          </div>
        </article>
      `;
    }).join("");
  } catch (error) {
    console.error("Erreur historique Firebase:", error);
    target.innerHTML = `<div class="history-item">Erreur de chargement de l'historique. Réessaie plus tard.</div>`;
  }
}

window.filterHistory = function (btn, type) {
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  document.querySelectorAll("#history-list .history-item").forEach((item) => {
    item.style.display = type === "all" || item.dataset.type === type ? "flex" : "none";
  });
};


function isTextLikeFile(fileName = "") {
  return /\.(txt|md|csv|json|html|log|js|css|py|php|java|xml|yml|yaml)$/i.test(fileName);
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function openChatAttachmentPicker() {
  $("assistant-file-input")?.click();
}

window.openChatAttachmentPicker = openChatAttachmentPicker;

async function readFileAsText(file) {
  return file.text();
}

function removePendingAttachment(id) {
  pendingChatAttachments = pendingChatAttachments.filter((item) => item.id !== id);
  renderPendingAttachments();
}

window.removePendingAttachment = removePendingAttachment;

function clearPendingAttachments() {
  for (const item of pendingChatAttachments) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
  pendingChatAttachments = [];
  renderPendingAttachments();
  const input = $("assistant-file-input");
  if (input) input.value = "";
}

function renderPendingAttachments() {
  const box = $("assistant-attachments");
  if (!box) return;

  if (!pendingChatAttachments.length) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  box.style.display = "flex";
  box.innerHTML = pendingChatAttachments.map((item) => `
    <article class="attachment-chip ${item.kind === "image" ? "image" : "file"}">
      ${item.previewUrl ? `<img src="${item.previewUrl}" alt="${escapeHTML(item.name)}" />` : `<span class="attachment-icon">${item.kind === "image" ? "🖼️" : "📄"}</span>`}
      <div>
        <strong>${escapeHTML(item.name)}</strong>
        <small>${escapeHTML(item.label)}</small>
      </div>
      <button type="button" onclick="removePendingAttachment('${escapeHTML(item.id)}')">×</button>
    </article>
  `).join("");
}

window.handleChatAttachments = async function (event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  for (const file of files) {
    const id = `att_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const isImage = file.type.startsWith("image/");
    const item = {
      id,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      kind: isImage ? "image" : "file",
      label: `${isImage ? "Image" : "Fichier"} • ${formatBytes(file.size)}`,
      textContent: "",
      previewUrl: isImage ? URL.createObjectURL(file) : ""
    };

    if (isTextLikeFile(file.name)) {
      try {
        const text = await readFileAsText(file);
        item.textContent = text.slice(0, 12000);
        item.label = `Fichier texte • ${formatBytes(file.size)}`;
      } catch (error) {
        console.error("Erreur lecture fichier", error);
      }
    }

    pendingChatAttachments.push(item);
  }

  renderPendingAttachments();
};

function buildAttachmentPromptContext() {
  if (!pendingChatAttachments.length) return "";

  const parts = pendingChatAttachments.map((item, index) => {
    if (item.textContent) {
      return `Pièce jointe ${index + 1} — ${item.name}\nType: ${item.type}\nContenu extrait:\n${item.textContent}`;
    }

    if (item.kind === "image") {
      return `Pièce jointe ${index + 1} — ${item.name}\nType: image\nNote: une image est jointe à la demande. Dans cette version, l'assistant reçoit surtout le nom du fichier et le contexte texte. Si besoin, il peut proposer quoi faire avec l'image ou demander une description complémentaire.`;
    }

    return `Pièce jointe ${index + 1} — ${item.name}\nType: ${item.type}\nNote: fichier joint. Le contenu n'a pas pu être extrait automatiquement dans cette version.`;
  });

  return `\n\nPièces jointes de l'utilisateur :\n\n${parts.join("\n\n---\n\n")}`;
}


// ============================================================
// CHAT CENTRAL WORKMATE — conversations sauvegardées
// ============================================================

function getConversations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.conversations) || "[]");
  } catch {
    return [];
  }
}

function saveConversations(conversations) {
  localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(conversations));
  renderConversationsList();
  renderDashboardConversations();
}

function getCurrentConversationId() {
  let id = localStorage.getItem(STORAGE_KEYS.currentConversation);
  const conversations = getConversations();

  if (!id || !conversations.some((c) => c.id === id)) {
    id = createConversation(false);
  }

  return id;
}

function createConversation(render = true) {
  const conversations = getConversations();
  const id = `conv_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  conversations.unshift({
    id,
    title: "Nouvelle discussion",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  localStorage.setItem(STORAGE_KEYS.currentConversation, id);
  saveConversations(conversations);

  if (render) {
    renderConversationMessages();
  }

  return id;
}

function updateConversation(id, updater) {
  const conversations = getConversations();
  const index = conversations.findIndex((c) => c.id === id);
  if (index === -1) return;

  conversations[index] = updater(conversations[index]);
  conversations[index].updatedAt = new Date().toISOString();

  conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  saveConversations(conversations);
}

function getCurrentConversation() {
  const id = getCurrentConversationId();
  return getConversations().find((c) => c.id === id);
}

function titleFromText(text = "") {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? clean.slice(0, 42) + "..." : clean || "Nouvelle discussion";
}

function assistantEmptyHTML() {
  return `
    <div class="assistant-empty">
      <h3>Démarre une demande</h3>
      <p>Écris directement dans la zone de message, ou utilise les actions rapides à côté du titre Assistant.</p>
    </div>
  `;
}

function renderAssistantMessage(role, text, typing = false) {
  const box = $("assistant-messages");
  if (!box) return;

  const empty = box.querySelector(".assistant-empty");
  if (empty) empty.remove();

  const div = document.createElement("div");
  div.className = `msg ${role}${typing ? " typing-message" : ""}`;
  div.innerHTML = `
    <small>${role === "user" ? "Vous" : "Assistant"}</small>
    <div class="bubble">${typing ? '<span class="typing-dots"><i></i><i></i><i></i></span>' : escapeHTML(text)}</div>
  `;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  return div;
}

function renderConversationMessages() {
  const box = $("assistant-messages");
  if (!box) return;

  const conversation = getCurrentConversation();
  const messages = conversation?.messages || [];

  box.innerHTML = messages.length ? "" : assistantEmptyHTML();

  for (const msg of messages) {
    renderAssistantMessage(msg.role === "assistant" ? "ai" : "user", msg.content);
  }
}

function renderConversationsList() {
  const target = $("conversations-list");
  if (!target) return;

  const currentId = localStorage.getItem(STORAGE_KEYS.currentConversation);
  const search = $("chat-search-input")?.value.trim().toLowerCase() || "";

  let conversations = getConversations();

  if (search) {
    conversations = conversations.filter((c) =>
      (c.title || "").toLowerCase().includes(search) ||
      (c.messages || []).some((m) => (m.content || "").toLowerCase().includes(search))
    );
  }

  conversations = conversations.slice(0, 12);

  if (!conversations.length) {
    target.innerHTML = `<div class="empty-recent">Aucun chat trouvé.</div>`;
    return;
  }

  target.innerHTML = conversations.map((c) => `
    <button class="conversation-link ${c.id === currentId ? "active" : ""}" onclick="loadConversation('${escapeHTML(c.id)}')">
      <span>${escapeHTML(c.title || "Discussion")}</span>
      <small>${new Date(c.updatedAt || c.createdAt).toLocaleDateString("fr-FR")}</small>
    </button>
  `).join("");
}

function renderDashboardConversations() {
  const target = $("dashboard-conversations");
  if (!target) return;

  const conversations = getConversations().slice(0, 5);
  if (!conversations.length) {
    target.innerHTML = `<div class="history-item">Aucune discussion pour l’instant.</div>`;
    return;
  }

  target.innerHTML = conversations.map((c) => `
    <button class="mini-row" onclick="loadConversation('${escapeHTML(c.id)}'); switchView('assistant')">
      <strong>${escapeHTML(c.title || "Discussion")}</strong>
      <span>${escapeHTML((c.messages?.length || 0) + " messages")}</span>
    </button>
  `).join("");
}

window.loadConversation = function (id) {
  localStorage.setItem(STORAGE_KEYS.currentConversation, id);
  renderConversationMessages();
  renderConversationsList();
};

window.newConversation = function () {
  createConversation(true);
  clearPendingAttachments();
  switchView("assistant");
};

window.clearCurrentConversation = function () {
  const id = getCurrentConversationId();
  if (!confirm("Effacer cette discussion ?")) return;

  updateConversation(id, (conversation) => ({
    ...conversation,
    title: "Nouvelle discussion",
    messages: []
  }));

  renderConversationMessages();
  clearPendingAttachments();
};

window.exportCurrentConversation = function () {
  const conversation = getCurrentConversation();
  if (!conversation) return;

  const content = [
    `# ${conversation.title || "Discussion WorkMate"}`,
    "",
    ...(conversation.messages || []).map((m) => `## ${m.role === "user" ? "Vous" : "Assistant"}\n\n${m.content}`)
  ].join("\n\n");

  downloadTextFile(`${conversation.title || "conversation"}.md`, content);
};

function saveMessageToCurrentConversation(role, content) {
  const id = getCurrentConversationId();

  updateConversation(id, (conversation) => {
    const messages = [...(conversation.messages || []), { role, content, createdAt: new Date().toISOString() }];
    const title = conversation.title === "Nouvelle discussion" && role === "user"
      ? titleFromText(content)
      : conversation.title;

    return { ...conversation, title, messages };
  });
}

window.sendAssistantMessage = async function () {
  const input = $("assistant-input");
  const text = input?.value.trim();
  if (!text && !pendingChatAttachments.length) return;

  const attachmentNames = pendingChatAttachments.map((item) => item.name);
  const visibleUserText = text || "Pièces jointes envoyées";
  const messageForHistory = attachmentNames.length
    ? `${visibleUserText}

Pièces jointes : ${attachmentNames.join(", ")}`
    : visibleUserText;

  saveMessageToCurrentConversation("user", messageForHistory);
  renderAssistantMessage("user", messageForHistory);

  const attachmentContext = buildAttachmentPromptContext();
  const finalPrompt = `${text || "Analyse les pièces jointes et aide-moi."}${attachmentContext}`;

  input.value = "";
  input.style.height = "";

  const typing = renderAssistantMessage("ai", "", true);
  setBtnBusy("btn-assistant", true, "Envoi...");

  const conversation = getCurrentConversation();
  const context = (conversation?.messages || [])
    .slice(-12)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  try {
    const answer = await callWorkMateAI(finalPrompt, "general", context);

    if (typing) typing.remove();
    renderAssistantMessage("ai", answer);
    saveMessageToCurrentConversation("assistant", answer);

    extractActionsFromText(answer, "Assistant");
    await saveAnalysis("assistant", `Discussion — ${(text || "Pièces jointes").slice(0, 45)}...`, "Réponse de l’assistant", answer);
    clearPendingAttachments();
  } catch (error) {
    if (typing) typing.remove();
    const msg = `Erreur : ${error.message}`;
    renderAssistantMessage("ai", msg);
    saveMessageToCurrentConversation("assistant", msg);
    clearPendingAttachments();
  } finally {
    setBtnBusy("btn-assistant", false);
    renderConversationsList();
    renderDashboardConversations();
  }
};

$("assistant-input")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    window.sendAssistantMessage();
  }
});

$("assistant-input")?.addEventListener("input", (event) => {
  const el = event.target;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 170)}px`;
});


// ============================================================
// REUNION
// ============================================================

window.analyzeReunion = async function () {
  const text = $("reunion-input")?.value.trim();
  const agenda = $("reunion-agenda")?.value.trim() || "";

  if (!text) return alert("Colle tes notes d'abord !");

  const box = $("reunion-result");
  const body = $("reunion-body");
  box?.classList.add("visible");
  if (body) body.innerHTML = loadingHTML();
  setBtnBusy("btn-reunion", true, "Analyse...");

  try {
    const agendaText = agenda ? `\n\nOrdre du jour prévu :\n${agenda}` : "";
    const result = await callWorkMateAI(`
Analyse ces notes de réunion et structure ta réponse EXACTEMENT ainsi :

DÉCISIONS PRISES
• [décisions claires, une par ligne]

✅ TÂCHES À FAIRE
• [Tâche] — Responsable : [nom si mentionné] — Deadline : [si mentionnée]

ORDRE DU JOUR — POINTS TRAITÉS
• [vérifie si chaque point de l'ordre du jour a été traité]

❓ POINTS FLOUS À CLARIFIER
• [ambiguïtés ou questions non résolues]

RECOMMANDATION
[une recommandation rapide pour le suivi]

Notes :
${text}${agendaText}
    `, "reunion");

    if (body) body.textContent = result;
    await saveAnalysis("reunion", `Réunion — ${text.slice(0, 40)}...`, "Analyse complète", result);
  } catch (error) {
    if (body) body.textContent = `Erreur : ${error.message}`;
  } finally {
    setBtnBusy("btn-reunion", false);
  }
};

// ============================================================
// EMAIL
// ============================================================

window.generateEmail = async function () {
  const text = $("email-input")?.value.trim();
  if (!text) return alert("Décris ta situation d'abord !");

  const box = $("email-result");
  const vars = $("email-variants");
  box?.classList.add("visible");
  if (vars) vars.innerHTML = loadingHTML("Rédaction en cours...");
  setBtnBusy("btn-email", true, "Rédaction...");

  try {
    const result = await callWorkMateAI(`
Rédige 3 versions d'email en français avec ce format EXACT :

VERSION 1 — Ton direct et factuel
[email complet avec Objet:]
---
VERSION 2 — Ton empathique et diplomatique
[email complet avec Objet:]
---
VERSION 3 — Ton assertif et orienté solution
[email complet avec Objet:]

Situation :
${text}
    `, "email");

    const parts = result.split("---").map((v) => v.trim()).filter(Boolean);

    if (vars) {
      vars.innerHTML = parts.map((part, index) => `
        <article class="email-card">
          <h4>Version ${index + 1}</h4>
          <pre id="email-version-${index}">${escapeHTML(part)}</pre>
          <button class="btn btn-soft copy-btn" onclick="copyEl('email-version-${index}')">Copier</button>
        </article>
      `).join("");
    }

    await saveAnalysis("email", `Email — ${text.slice(0, 40)}...`, "3 versions générées", result);
  } catch (error) {
    if (vars) vars.innerHTML = `<div class="error" style="display:block">Erreur : ${escapeHTML(error.message)}</div>`;
  } finally {
    setBtnBusy("btn-email", false);
  }
};

// ============================================================
// FOCUS
// ============================================================

window.addTask = function () {
  const input = $("task-input");
  const value = input?.value.trim();
  if (!value) return;

  tasks.push(value);
  input.value = "";
  renderTasks();
};

window.removeTask = function (index) {
  tasks.splice(index, 1);
  renderTasks();
};

function renderTasks() {
  const box = $("tasks-chips");
  if (!box) return;

  box.innerHTML = tasks.map((task, index) => `
    <span class="chip">${escapeHTML(task)} <button onclick="removeTask(${index})">✕</button></span>
  `).join("");
}

window.analyzeFocus = async function () {
  if (!tasks.length) return alert("Ajoute au moins une tâche !");

  requestNotifPermission();

  const box = $("focus-result");
  const body = $("focus-body");
  box?.classList.add("visible");
  if (body) body.innerHTML = loadingHTML("Organisation des tâches...");
  setBtnBusy("btn-focus", true, "Organisation...");

  try {
    const result = await callWorkMateAI(`
Organise ces tâches avec ce format EXACT :

PRIORITÉ ABSOLUE (à faire en premier)
• [tâche] — ⏱ ~[durée] → [sous-étapes si complexe]

⚡ IMPORTANT (à caser dans la journée)
• [tâche] — ⏱ ~[durée]

PEUT ATTENDRE (reporter si besoin)
• [tâche]

CONSEIL DU JOUR
[conseil personnalisé et actionnable]

Tâches :
${tasks.map((task, i) => `${i + 1}. ${task}`).join("\n")}
    `, "focus");

    if (body) body.textContent = result;
    checkUrgentTasks(result);
    await saveAnalysis("focus", `Focus — ${new Date().toLocaleDateString("fr-FR")}`, `${tasks.length} tâche(s) organisée(s)`, result);
  } catch (error) {
    if (body) body.textContent = `Erreur : ${error.message}`;
  } finally {
    setBtnBusy("btn-focus", false);
  }
};

// ============================================================
// GMAIL
// ============================================================

function showGmailConnected(connected) {
  const ui = $("gmail-connect-ui");
  const ok = $("gmail-connected");
  if (ui) ui.style.display = connected ? "none" : "block";
  if (ok) ok.style.display = connected ? "flex" : "none";
}

window.saveGmailToken = function () {
  const input = $("gmail-token-input");
  const token = input?.value.trim();
  if (!token) return alert("Colle d'abord ton Access token Gmail !");

  gmailAccessToken = token;
  localStorage.setItem("gmail_token", token);
  input.value = "";
  showGmailConnected(true);
};

window.resetGmailToken = function () {
  gmailAccessToken = null;
  localStorage.removeItem("gmail_token");
  showGmailConnected(false);
  showMessage("gmail-settings-msg", "Gmail a été déconnecté.", true);
};

window.connectGmailOAuth = async function () {
  setBtnBusy("btn-connect-gmail", true, "Connexion...");

  try {
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
    provider.setCustomParameters({
      prompt: "consent select_account"
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error("Aucun accès Gmail reçu. Vérifie que l'autorisation Gmail a été acceptée.");
    }

    gmailAccessToken = credential.accessToken;
    localStorage.setItem("gmail_token", credential.accessToken);
    showGmailConnected(true);
  } catch (error) {
    console.error("Erreur connexion Gmail OAuth:", error);

    if (error.code === "auth/popup-closed-by-user") {
      alert("Connexion Gmail annulée.");
    } else if (error.code === "auth/popup-blocked") {
      alert("Le navigateur a bloqué la fenêtre Google. Autorise les popups puis réessaie.");
    } else {
      alert(error.message || "Impossible de connecter Gmail.");
    }
  } finally {
    setBtnBusy("btn-connect-gmail", false);
  }
};


function renderGmailPreview(emails = []) {
  const target = $("gmail-preview");
  if (!target) return;

  if (!emails.length) {
    target.style.display = "none";
    target.innerHTML = "";
    return;
  }

  const sample = emails.slice(0, 12);
  target.style.display = "block";
  target.innerHTML = `
    <div class="section-title">
      <h3>Aperçu Gmail</h3>
      <span>${emails.length} emails lus</span>
    </div>
    <div class="gmail-table">
      ${sample.map((email) => `
        <article>
          <strong>${escapeHTML(email.subject || "Sans objet")}</strong>
          <span>${escapeHTML(email.from || "")}</span>
          <p>${escapeHTML(email.snippet || "")}</p>
          <button class="btn btn-soft" onclick="prepareReplyFromEmail('${escapeHTML(email.id)}')">Préparer une réponse</button>
        </article>
      `).join("")}
    </div>
  `;
}

window.prepareReplyFromEmail = function (id) {
  const email = lastGmailEmails.find((e) => e.id === id);
  if (!email) return;

  switchEmailMode("manuel");
  safeSetValue("email-input", `Prépare une réponse professionnelle à cet email :

De : ${email.from}
Objet : ${email.subject}
Message : ${email.snippet}

Ton souhaité : clair, poli, professionnel.`);
};

window.loadGmailEmails = async function () {
  const token = gmailAccessToken || localStorage.getItem("gmail_token");
  if (!token) return alert("Connecte d'abord ton Gmail !");

  const typeInclure = $("gmail-inclure")?.value.trim() || "";
  const typeExclure = $("gmail-exclure")?.value.trim() || "";
  const box = $("gmail-result");
  const body = $("gmail-body");

  const maxChoice = $("gmail-max")?.value || "200";
  const readAll = maxChoice === "all";
  const targetMax = readAll ? Infinity : Number(maxChoice || 200);
  const gmailFilter = $("gmail-filter")?.value || "all";
  const gmailOutput = $("gmail-output")?.value || "summary";
  let queryValue = $("gmail-query")?.value || "";

  if (gmailFilter === "unread") queryValue = `${queryValue} is:unread`.trim();
  if (gmailFilter === "important") queryValue = `${queryValue} is:important`.trim();
  if (gmailFilter === "attachments") queryValue = `${queryValue} has:attachment`.trim();

  box?.classList.add("visible");
  if (body) {
    body.textContent =
      readAll
        ? "Lecture complète de Gmail en cours... Cette opération peut prendre plusieurs minutes selon le nombre d'emails."
        : "Lecture et analyse des emails...";
  }

  setBtnBusy("btn-gmail", true, readAll ? "Lecture..." : "Analyse...");

  try {
    const allEmails = [];
    const seenIds = new Set();
    let nextPageToken = null;
    let page = 0;
    let resultSizeEstimate = 0;

    // Page de 100 emails pour éviter les timeouts.
    // Si l'utilisateur choisit "tout", on continue jusqu'à ce que Gmail ne donne plus de page suivante.
    const pageSize = 100;
    const safetyMaxPages = readAll ? 250 : Math.ceil(targetMax / pageSize);

    do {
      page += 1;

      if (body) {
        const limitText = readAll ? "tout Gmail accessible" : `${targetMax} emails maximum`;
        body.textContent = `Lecture Gmail...\nPage ${page}\nEmails récupérés : ${allEmails.length}\nMode : ${limitText}`;
      }

      const res = await fetch("/api/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: token,
          pageSize,
          pageToken: nextPageToken,
          query: queryValue
        })
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error("401 — session Gmail expirée");
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      resultSizeEstimate = data.resultSizeEstimate || resultSizeEstimate;

      const batch = Array.isArray(data.emails) ? data.emails : [];
      for (const email of batch) {
        if (email?.id && !seenIds.has(email.id)) {
          seenIds.add(email.id);
          allEmails.push(email);
        }
      }

      nextPageToken = data.nextPageToken || null;

      if (!readAll && allEmails.length >= targetMax) break;
      if (page >= safetyMaxPages) break;

      // Petite pause pour éviter d'enchaîner les appels trop brutalement.
      await new Promise((resolve) => setTimeout(resolve, 120));
    } while (nextPageToken);

    const emails = readAll ? allEmails : allEmails.slice(0, targetMax);
    lastGmailEmails = emails;
    renderGmailPreview(emails);

    if (!emails.length) {
      if (body) body.textContent = "Aucun email trouvé.";
      return;
    }

    function scoreEmail(email) {
      const text = `${email.from} ${email.subject} ${email.snippet}`.toLowerCase();

      const urgentWords = [
        "urgent", "important", "relance", "rappel", "deadline", "échéance", "echeance",
        "facture", "paiement", "impayé", "impaye", "devis", "contrat", "signature",
        "rendez-vous", "rdv", "meeting", "entretien", "réunion", "reunion",
        "action required", "required", "confirmation", "valider", "validation"
      ];

      const lowWords = [
        "newsletter", "unsubscribe", "désabonner", "desabonner", "promotion", "soldes",
        "facebook", "instagram", "tiktok", "linkedin", "no-reply", "noreply",
        "notification", "publicité", "publicite", "marketing"
      ];

      let score = 0;

      for (const word of urgentWords) {
        if (text.includes(word)) score += 3;
      }

      for (const word of lowWords) {
        if (text.includes(word)) score -= 2;
      }

      if (email.labels?.includes("IMPORTANT")) score += 4;
      if (email.labels?.includes("STARRED")) score += 4;
      if (email.labels?.includes("UNREAD")) score += 1;

      return score;
    }

    const scoredEmails = emails
      .map((email) => ({ ...email, score: scoreEmail(email) }))
      .sort((a, b) => b.score - a.score);

    // On lit beaucoup d'emails, mais on n'envoie pas tout à l'IA si le volume est énorme.
    // Sinon le modèle dépasse la limite de contexte.
    const aiEmails = scoredEmails.slice(0, 350);

    const emailsText = aiEmails.map((email, i) => {
      return `Email ${i + 1}:
Score local: ${email.score}
De: ${email.from}
Objet: ${email.subject}
Date: ${email.date}
Labels: ${(email.labels || []).join(", ")}
Aperçu: ${email.snippet}`;
    }).join("\n\n---\n\n");

    const filtreText = `${typeInclure ? `Types d'emails à METTRE EN PRIORITÉ : ${typeInclure}` : ""}
${typeExclure ? `Types d'emails à IGNORER : ${typeExclure}` : ""}`.trim();

    const stats = {
      totalRead: emails.length,
      estimate: resultSizeEstimate,
      sentToAI: aiEmails.length,
      unread: emails.filter((e) => e.labels?.includes("UNREAD")).length,
      important: emails.filter((e) => e.labels?.includes("IMPORTANT")).length,
      starred: emails.filter((e) => e.labels?.includes("STARRED")).length,
      lowPriority: scoredEmails.filter((e) => e.score < 0).length,
      highPriority: scoredEmails.filter((e) => e.score >= 3).length
    };

    if (body) {
      body.textContent =
        `Lecture terminée.\n` +
        `Emails lus : ${stats.totalRead}\n` +
        `Estimation Gmail : ${stats.estimate || "non disponible"}\n` +
        `Emails prioritaires détectés localement : ${stats.highPriority}\n` +
        `Emails envoyés à l'analyse IA : ${stats.sentToAI}\n\n` +
        `Analyse IA en cours...`;
    }

    const result = await callWorkMateAI(`
Tu es un assistant professionnel chargé de trier une boîte Gmail.

Important :
- L'application a lu ${stats.totalRead} emails au total.
- Gmail estime environ ${stats.estimate || "un nombre inconnu d'"} emails pour cette recherche.
- Pour respecter les limites de contexte, seuls les ${stats.sentToAI} emails les plus pertinents/prioritaires sont fournis ci-dessous.
- Les autres emails ont été parcourus localement et les statistiques sont fournies.

Statistiques globales :
- Emails lus : ${stats.totalRead}
- Non lus : ${stats.unread}
- Marqués importants : ${stats.important}
- Favoris : ${stats.starred}
- Prioritaires localement : ${stats.highPriority}
- Basse priorité localement : ${stats.lowPriority}

Objectif :
- Trier les emails utiles.
- Identifier ce qui demande une action.
- Prioriser les messages importants.
- Ignorer les pubs, réseaux sociaux, newsletters inutiles si demandé.
- Donner une synthèse claire et actionnable.
- Mode de sortie demandé : ${gmailOutput === "reply" ? "proposer aussi des réponses prêtes à envoyer pour les emails importants" : gmailOutput === "actions" ? "extraire uniquement les actions à faire" : "tri et résumé professionnel"}.

Structure ta réponse EXACTEMENT ainsi :

🚨 URGENT — À traiter aujourd'hui
• [Objet] — De : [expéditeur] — Action recommandée : [quoi faire] — Raison : [raison]

⭐ IMPORTANT — À traiter cette semaine
• [Objet] — De : [expéditeur] — Action recommandée : [quoi faire]

📌 INFORMATION — À lire seulement
• [Objet] — De : [expéditeur] — Résumé : [résumé court]

🗑️ À IGNORER / BASSE PRIORITÉ
• [Objet] — Raison : [pub, réseau social, notification, newsletter, etc.]

✅ PLAN D'ACTION
1. [première action]
2. [deuxième action]
3. [troisième action]

RÉSUMÉ GLOBAL
[Résumé en 3 phrases maximum]

${filtreText}

Emails les plus pertinents après lecture globale :
${emailsText}
    `, "gmail");

    if (body) {
      body.textContent =
        `Lecture Gmail terminée.\n` +
        `Emails lus : ${stats.totalRead}\n` +
        `Estimation Gmail : ${stats.estimate || "non disponible"}\n` +
        `Emails analysés par l'IA : ${stats.sentToAI}\n\n` +
        result;
    }

    extractActionsFromText(result, "Gmail");

    await saveAnalysis(
      "email",
      `Gmail — ${new Date().toLocaleDateString("fr-FR")}`,
      `${stats.totalRead} emails lus, ${stats.sentToAI} analysés par l'IA`,
      result
    );
  } catch (error) {
    if (error.message.includes("401") || error.message.includes("403")) {
      gmailAccessToken = null;
      localStorage.removeItem("gmail_token");
      showGmailConnected(false);
      if (body) body.textContent = "Session Gmail expirée. Reconnecte ton Gmail.";
    } else if (body) {
      body.textContent = `Erreur : ${error.message}`;
    }
  } finally {
    setBtnBusy("btn-gmail", false);
  }
};

window.switchEmailMode = function (mode) {
  const manual = $("email-mode-manuel");
  const gmail = $("email-mode-gmail");
  if (manual) manual.style.display = mode === "manuel" ? "block" : "none";
  if (gmail) gmail.style.display = mode === "gmail" ? "block" : "none";

  $("mode-btn-email-manuel")?.classList.toggle("active", mode === "manuel");
  $("mode-btn-email-gmail")?.classList.toggle("active", mode === "gmail");

  if (mode === "gmail") {
    gmailAccessToken = localStorage.getItem("gmail_token") || gmailAccessToken;
    showGmailConnected(!!gmailAccessToken);
  }
};

// ============================================================
// MICRO / TRANSCRIPTION
// ============================================================

let recognition = null;
let isRecording = false;
let fullTranscript = "";

window.switchReunionMode = function (mode) {
  const textMode = $("reunion-mode-texte");
  const microMode = $("reunion-mode-micro");

  if (textMode) textMode.style.display = mode === "texte" ? "block" : "none";
  if (microMode) microMode.style.display = mode === "micro" ? "block" : "none";

  $("mode-btn-texte")?.classList.toggle("active", mode === "texte");
  $("mode-btn-micro")?.classList.toggle("active", mode === "micro");

  if (mode !== "micro" && isRecording) stopRecording();
};

window.toggleRecording = function () {
  if (isRecording) stopRecording();
  else startRecording();
};

function startRecording() {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    alert("Utilise Chrome pour la reconnaissance vocale !");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "fr-FR";
  fullTranscript = $("reunion-transcript")?.value || "";

  recognition.onstart = () => {
    isRecording = true;
    safeSetText("btn-record", "⏹️ Arrêter l'écoute");
    safeSetText("micro-status-text", "Écoute en cours...");
    const waves = $("mic-waves");
    if (waves) waves.style.display = "flex";
  };

  recognition.onresult = (event) => {
    let interim = "";
    let final = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) final += `${event.results[i][0].transcript} `;
      else interim += event.results[i][0].transcript;
    }

    if (final) fullTranscript += final;
    safeSetValue("reunion-transcript", fullTranscript + interim);
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed") alert("Autorise l'accès au micro !");
    stopRecording();
  };

  recognition.onend = () => {
    if (isRecording) recognition.start();
  };

  recognition.start();
}

function stopRecording() {
  isRecording = false;

  if (recognition) {
    recognition.onend = null;
    recognition.stop();
  }

  safeSetText("btn-record", "🎙️ Démarrer l'écoute");
  safeSetText("micro-status-text", "✅ Enregistrement terminé");
  const waves = $("mic-waves");
  if (waves) waves.style.display = "none";
}

window.analyzeTranscript = async function () {
  const text = $("reunion-transcript")?.value.trim();
  if (!text) return alert("Lance d'abord l'écoute !");

  safeSetValue("reunion-input", text);
  switchReunionMode("texte");
  await analyzeReunion();
};

// ============================================================
// AUTH ACTIONS
// ============================================================

window.doLogin = async function () {
  const email = $("login-email")?.value.trim();
  const pass = $("login-pass")?.value;
  const err = $("auth-error");

  if (err) err.style.display = "none";
  setBtnBusy("btn-login", true, "Connexion...");

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (error) {
    if (err) {
      err.textContent = translateError(error.code);
      err.style.display = "block";
    }
    setBtnBusy("btn-login", false);
  }
};

window.doSignup = async function () {
  const firstname = $("signup-firstname")?.value.trim();
  const lastname = $("signup-lastname")?.value.trim();
  const email = $("signup-email")?.value.trim();
  const pass = $("signup-pass")?.value;
  const err = $("signup-error");

  if (err) err.style.display = "none";

  if (!pass || pass.length < 8) {
    if (err) {
      err.textContent = "Mot de passe trop court, minimum 8 caractères.";
      err.style.display = "block";
    }
    return;
  }

  setBtnBusy("btn-signup", true, "Création...");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      email,
      firstname,
      lastname,
      plan: "free",
      usage: {
        month: currentMonth(),
        total: 0,
        assistant: 0,
        reunion: 0,
        email: 0,
        focus: 0
      },
      createdAt: serverTimestamp()
    });
  } catch (error) {
    if (err) {
      err.textContent = translateError(error.code);
      err.style.display = "block";
    }
    setBtnBusy("btn-signup", false);
  }
};

window.doGoogleLogin = async function () {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (credential?.accessToken) {
      gmailAccessToken = credential.accessToken;
      localStorage.setItem("gmail_token", credential.accessToken);
    }
  } catch (error) {
    if (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request") {
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch {
        alert("Connexion Google indisponible. Utilise email + mot de passe.");
      }
    } else if (error.code !== "auth/popup-closed-by-user") {
      alert(`Erreur Google (${error.code}). Utilise email + mot de passe.`);
    }
  }
};

window.doLogout = async function () {
  assistantHistory.length = 0;
  await signOut(auth);
};

window.doResetPassword = async function () {
  const email = prompt("Entre ton email :");
  if (!email) return;

  try {
    await sendPasswordResetEmail(auth, email);
    alert("Email de réinitialisation envoyé !");
  } catch (error) {
    alert(`Erreur : ${translateError(error.code)}`);
  }
};


window.saveAppSettings = function () {
  const settings = {
    ...getAppSettings(),
    workspaceName: $("settings-workspace-name")?.value.trim() || "Espace de travail",
    theme: $("settings-theme")?.value || "dark",
    language: $("settings-language")?.value || "fr",
    tone: $("settings-tone")?.value || "professional",
    gmailQuery: $("settings-gmail-query")?.value ?? "in:inbox newer_than:30d",
    gmailMax: $("settings-gmail-max")?.value || "200"
  };

  saveSettingsToLocal(settings);
  applyAppSettings();
  updateSettingsForm();

  showMessage("settings-msg", "Paramètres sauvegardés.", true);
  showMessage("gmail-settings-msg", "Paramètres Gmail sauvegardés.", true);
};

window.resetAppSettings = function () {
  saveSettingsToLocal({ ...DEFAULT_APP_SETTINGS });
  applyAppSettings();
  updateSettingsForm();

  showMessage("settings-msg", "Paramètres réinitialisés.", true);
};

// ============================================================
// PROFIL
// ============================================================

window.saveProfile = async function () {
  if (!currentUser) return;

  const firstname = $("profile-firstname")?.value.trim() || "";
  const lastname = $("profile-lastname")?.value.trim() || "";
  const msg = $("profile-msg");

  try {
    await updateDoc(doc(db, "users", currentUser.uid), { firstname, lastname });
    userProfile.firstname = firstname;
    userProfile.lastname = lastname;
    updateUIWithProfile();

    if (msg) {
      msg.textContent = "✓ Profil sauvegardé !";
      msg.style.color = "var(--success)";
      msg.style.display = "block";
      setTimeout(() => (msg.style.display = "none"), 3000);
    }
  } catch {
    if (msg) {
      msg.textContent = "Erreur pendant la sauvegarde.";
      msg.style.color = "var(--danger)";
      msg.style.display = "block";
    }
  }
};

window.changePassword = async function () {
  const newPass = $("new-pass")?.value || "";
  const confirmPass = $("confirm-pass")?.value || "";
  const msg = $("pass-msg");

  function showPassMsg(text, color) {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = color;
    msg.style.display = "block";
  }

  if (newPass !== confirmPass) {
    showPassMsg("Les mots de passe ne correspondent pas.", "var(--danger)");
    return;
  }

  if (newPass.length < 8) {
    showPassMsg("Minimum 8 caractères.", "var(--danger)");
    return;
  }

  try {
    await updatePassword(auth.currentUser, newPass);
    safeSetValue("new-pass", "");
    safeSetValue("confirm-pass", "");
    showPassMsg("✓ Mot de passe changé !", "var(--success)");
    setTimeout(() => {
      if (msg) msg.style.display = "none";
    }, 3000);
  } catch (error) {
    showPassMsg(translateError(error.code), "var(--danger)");
  }
};


window.setAssistantPrompt = function (text) {
  const input = $("assistant-input");
  if (!input) return;
  input.value = text;
  input.focus();
};


window.openWorkspaceTool = function (toolName) {
  switchView(toolName);
};


// ============================================================
// DOCUMENTS LOCAUX
// ============================================================

function getLocalDocuments() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.documents) || "[]");
  } catch {
    return [];
  }
}

function saveLocalDocuments(docs) {
  localStorage.setItem(STORAGE_KEYS.documents, JSON.stringify(docs));
  renderDocumentsList();
}

function renderDocumentsList() {
  const target = $("documents-list");
  if (!target) return;

  const docs = getLocalDocuments();

  if (!docs.length) {
    target.innerHTML = `<div class="history-item">Aucun document sauvegardé.</div>`;
    return;
  }

  target.innerHTML = docs.map((doc) => `
    <article class="document-card">
      <div>
        <strong>${escapeHTML(doc.title)}</strong>
        <small>${new Date(doc.createdAt).toLocaleString("fr-FR")}</small>
        <p>${escapeHTML((doc.content || "").slice(0, 180))}${(doc.content || "").length > 180 ? "..." : ""}</p>
      </div>
      <div class="document-actions">
        <button class="btn btn-soft" onclick="loadDocumentIntoEditor('${escapeHTML(doc.id)}')">Ouvrir</button>
        <button class="btn btn-ghost" onclick="deleteDocument('${escapeHTML(doc.id)}')">Supprimer</button>
      </div>
    </article>
  `).join("");
}

window.handleDocumentFile = async function (event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const allowedAsText = /\.(txt|md|csv|json|html|log|js|css|py|php|java|xml|yml|yaml)$/i.test(file.name);

  if (!allowedAsText) {
    alert("Ce format ne peut pas être lu directement sans bibliothèque dédiée. Pour PDF ou Word, copie-colle le texte dans la zone document.");
    event.target.value = "";
    return;
  }

  const text = await file.text();
  safeSetValue("document-title", file.name);
  safeSetValue("document-input", text);
};

window.saveDocumentOnly = function () {
  const content = $("document-input")?.value.trim();
  if (!content) return alert("Ajoute un contenu à sauvegarder.");

  const title = $("document-title")?.value.trim() || `Document ${new Date().toLocaleDateString("fr-FR")}`;
  const docs = getLocalDocuments();

  docs.unshift({
    id: `doc_${Date.now()}`,
    title,
    content,
    createdAt: new Date().toISOString()
  });

  saveLocalDocuments(docs);
  showMessage("settings-msg", "Document sauvegardé.", true);
};

window.loadDocumentIntoEditor = function (id) {
  const doc = getLocalDocuments().find((d) => d.id === id);
  if (!doc) return;

  safeSetValue("document-title", doc.title);
  safeSetValue("document-input", doc.content);
  switchView("documents");
};

window.deleteDocument = function (id) {
  if (!confirm("Supprimer ce document local ?")) return;
  saveLocalDocuments(getLocalDocuments().filter((d) => d.id !== id));
};

window.analyzeDocument = async function () {
  const content = $("document-input")?.value.trim();
  const title = $("document-title")?.value.trim() || "Document";
  const action = $("document-action")?.value || "summary";
  const box = $("document-result");
  const body = $("document-body");

  if (!content) return alert("Ajoute un contenu à analyser.");

  box?.classList.add("visible");
  if (body) body.innerHTML = loadingHTML("Analyse du document...");
  setBtnBusy("btn-document", true, "Analyse...");

  const prompts = {
    summary: "Fais un résumé clair, structuré et facile à relire.",
    actions: "Extrais toutes les actions à faire, les échéances, les responsables et les points bloquants.",
    email: "Transforme ce contenu en email professionnel clair, poli et structuré.",
    report: "Transforme ce contenu en compte rendu professionnel avec titres et sous-parties."
  };

  try {
    const result = await callWorkMateAI(`
Titre du document : ${title}

Consigne : ${prompts[action] || prompts.summary}

Contenu :
${content}
    `, "document");

    if (body) body.textContent = result;

    const docs = getLocalDocuments();
    docs.unshift({
      id: `doc_${Date.now()}`,
      title,
      content,
      result,
      createdAt: new Date().toISOString()
    });
    saveLocalDocuments(docs);

    extractActionsFromText(result, `Document — ${title}`);
    await saveAnalysis("assistant", `Document — ${title}`, "Analyse de document", result);
  } catch (error) {
    if (body) body.textContent = `Erreur : ${error.message}`;
  } finally {
    setBtnBusy("btn-document", false);
  }
};

// ============================================================
// ACTIONS À FAIRE
// ============================================================

function getLocalActions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.actions) || "[]");
  } catch {
    return [];
  }
}

function saveLocalActions(actions) {
  localStorage.setItem(STORAGE_KEYS.actions, JSON.stringify(actions));
  renderActionsList();
  renderDashboardActions();
}

function renderActionsList() {
  const target = $("actions-list");
  if (!target) return;

  const actions = getLocalActions();

  if (!actions.length) {
    target.innerHTML = `<div class="history-item">Aucune action pour l’instant.</div>`;
    return;
  }

  target.innerHTML = actions.map((action) => `
    <article class="action-item ${action.done ? "done" : ""}">
      <label>
        <input type="checkbox" ${action.done ? "checked" : ""} onchange="toggleActionDone('${escapeHTML(action.id)}')" />
        <span>${escapeHTML(action.text)}</span>
      </label>
      <small>${escapeHTML(action.source || "Manuel")} — ${new Date(action.createdAt).toLocaleDateString("fr-FR")}</small>
      <button class="btn btn-ghost" onclick="deleteAction('${escapeHTML(action.id)}')">Supprimer</button>
    </article>
  `).join("");
}

function renderDashboardActions() {
  const target = $("dashboard-actions");
  if (!target) return;

  const actions = getLocalActions().filter((a) => !a.done).slice(0, 5);

  if (!actions.length) {
    target.innerHTML = `<div class="history-item">Aucune action en attente.</div>`;
    return;
  }

  target.innerHTML = actions.map((action) => `
    <article class="action-item compact">
      <label>
        <input type="checkbox" onchange="toggleActionDone('${escapeHTML(action.id)}')" />
        <span>${escapeHTML(action.text)}</span>
      </label>
    </article>
  `).join("");
}

window.addManualAction = function () {
  const input = $("manual-action-input");
  const text = input?.value.trim();

  if (!text) return;

  const actions = getLocalActions();
  actions.unshift({
    id: `act_${Date.now()}`,
    text,
    source: "Manuel",
    done: false,
    createdAt: new Date().toISOString()
  });

  input.value = "";
  saveLocalActions(actions);
};

window.toggleActionDone = function (id) {
  const actions = getLocalActions().map((a) => a.id === id ? { ...a, done: !a.done } : a);
  saveLocalActions(actions);
};

window.deleteAction = function (id) {
  saveLocalActions(getLocalActions().filter((a) => a.id !== id));
};

function extractActionsFromText(text = "", source = "Assistant") {
  const lines = String(text)
    .split("\n")
    .map((l) => l.replace(/^[-•✅\d.)\s]+/, "").trim())
    .filter(Boolean);

  const actionLines = lines.filter((line) =>
    /(\bfaire\b|\bpréparer\b|\bappeler\b|\benvoyer\b|\brépondre\b|\bcontacter\b|\bvalider\b|\bvérifier\b|\bcorriger\b|\bcréer\b|\bmettre\b|\btraiter\b|action|à faire|deadline|échéance)/i.test(line)
  ).slice(0, 12);

  if (!actionLines.length) return;

  const existing = getLocalActions();
  const existingTexts = new Set(existing.map((a) => a.text.toLowerCase()));

  for (const line of actionLines) {
    if (line.length < 8) continue;
    if (existingTexts.has(line.toLowerCase())) continue;

    existing.unshift({
      id: `act_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      text: line.slice(0, 240),
      source,
      done: false,
      createdAt: new Date().toISOString()
    });
  }

  saveLocalActions(existing.slice(0, 200));
}

// ============================================================
// CONFIDENTIALITÉ / EXPORT
// ============================================================

window.exportLocalData = function () {
  const data = {
    exportedAt: new Date().toISOString(),
    settings: getAppSettings(),
    conversations: getConversations(),
    documents: getLocalDocuments(),
    actions: getLocalActions()
  };

  downloadTextFile("workmate-donnees-locales.json", JSON.stringify(data, null, 2), "application/json");
};

window.clearLocalWorkspaceData = function () {
  if (!confirm("Effacer conversations, documents, actions et paramètres locaux ?")) return;

  localStorage.removeItem(STORAGE_KEYS.conversations);
  localStorage.removeItem(STORAGE_KEYS.currentConversation);
  localStorage.removeItem(STORAGE_KEYS.documents);
  localStorage.removeItem(STORAGE_KEYS.actions);
  localStorage.removeItem("workmate_settings");

  initTheme();
  renderConversationsList();
  renderConversationMessages();
  renderDocumentsList();
  renderActionsList();
  renderDashboardActions();
  renderDashboardConversations();

  alert("Données locales effacées.");
};


window.focusChatSearch = function () {
  const wrap = $("sidebar-search-wrap");
  const input = $("chat-search-input");
  if (!wrap) return;

  wrap.style.display = wrap.style.display === "none" ? "block" : "none";

  if (wrap.style.display !== "none") {
    setTimeout(() => input?.focus(), 50);
  }
};

window.toggleMoreSidebar = function () {
  const more = $("sidebar-more");
  if (!more) return;
  more.style.display = more.style.display === "none" ? "grid" : "none";
};

window.toggleRecents = function () {
  const list = $("conversations-list");
  if (!list) return;
  list.style.display = list.style.display === "none" ? "grid" : "grid";
};

window.searchConversations = function () {
  renderConversationsList();
};

// ============================================================
// NAVIGATION
// ============================================================

window.showPage = function (id) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
    page.style.display = "none";
  });

  const page = $(`page-${id}`);
  if (!page) return;
  page.style.display = id === "app" ? "flex" : "flex";
  requestAnimationFrame(() => page.classList.add("active"));
};

window.showAuth = function (mode) {
  showPage("auth");
  toggleAuth(mode);
};

window.toggleAuth = function (mode) {
  const login = $("auth-login");
  const signup = $("auth-signup");
  if (login) login.style.display = mode === "login" ? "block" : "none";
  if (signup) signup.style.display = mode === "signup" ? "block" : "none";
};

const viewTitles = {
  dashboard: "Tableau de bord",
  assistant: "Assistant Central",
  reunion: "Réunions",
  email: "Emails",
  focus: "Priorités",
  history: "Historique",
  profile: "Profil"
};

window.switchView = function (name) {
  document.querySelectorAll(".app-view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".sidebar-item, .side-action, .account-row").forEach((b) => b.classList.remove("active"));

  const view = $(`view-${name}`);
  if (view) view.classList.add("active");

  const viewTitles = {
    dashboard: "Tableau de bord",
    assistant: "Assistant Central",
    reunion: "Réunion",
    email: "Courriels",
    documents: "Bibliothèque",
    actions: "Actions",
    privacy: "Confidentialité",
    history: "Historique",
    profile: "Profil"
  };

  safeSetText("topbar-title", viewTitles[name] || "Assistant Central");
  closeMobileMenu();

  if (name === "history") loadHistory(100, "history-list");
  if (name === "documents") renderDocumentsList();
  if (name === "actions") renderActionsList();
  if (name === "assistant") {
    renderConversationMessages();
    renderConversationsList();
  }
  if (name === "profile") {
    updateSettingsForm();
    applyAppSettings();
  }
  if (name === "dashboard") refreshDashboard();
};

// ============================================================
// THEME + MOBILE
// ============================================================

window.toggleTheme = function () {
  const isLight = document.body.classList.toggle("light-mode");
  const settings = getAppSettings();

  settings.theme = isLight ? "light" : "dark";
  saveSettingsToLocal(settings);

  localStorage.setItem("theme", settings.theme);
  safeSetText("theme-icon", isLight ? "☀️" : "🌙");
  updateSettingsForm();
};

function initTheme() {
  const settings = getAppSettings();
  const oldSaved = localStorage.getItem("theme");

  if (oldSaved && !localStorage.getItem("workmate_settings")) {
    settings.theme = oldSaved;
    saveSettingsToLocal(settings);
  }

  applyAppSettings();
  updateSettingsForm();
}

window.toggleMobileMenu = function () {
  document.querySelector(".sidebar")?.classList.toggle("mobile-open");
  $("mobile-overlay")?.classList.toggle("active");
};

window.closeMobileMenu = function () {
  document.querySelector(".sidebar")?.classList.remove("mobile-open");
  $("mobile-overlay")?.classList.remove("active");
};

// La fonction globale est utile parce qu'elle est appelée dans switchView.
function closeMobileMenu() {
  window.closeMobileMenu();
}

// ============================================================
// NOTIFICATIONS
// ============================================================

async function requestNotifPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") await Notification.requestPermission();
}

function checkUrgentTasks(result) {
  if (!result || !("Notification" in window) || Notification.permission !== "granted") return;

  const lines = result.split("\n");
  let inUrgent = false;

  for (const line of lines) {
    if (line.includes("PRIORITÉ ABSOLUE")) {
      inUrgent = true;
      continue;
    }

    if (line.includes("IMPORTANT") || line.includes("PEUT ATTENDRE") || line.includes("CONSEIL")) {
      inUrgent = false;
    }

    if (inUrgent && line.trim().startsWith("•")) {
      new Notification("WorkMate — Tâche urgente !", {
        body: line.trim().replace("•", "").trim().slice(0, 80)
      });
      break;
    }
  }
}

// ============================================================
// COPY + INPUT EVENTS
// ============================================================

window.copyEl = function (id) {
  const el = $(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent || "");
};

window.copyRaw = function (btn, text) {
  navigator.clipboard.writeText(text);
  btn.textContent = "✓ Copié !";
  setTimeout(() => (btn.textContent = "Copier"), 2000);
};

$("reunion-input")?.addEventListener("input", function () {
  safeSetText("reunion-chars", this.value.length);
});

$("email-input")?.addEventListener("input", function () {
  safeSetText("email-chars", this.value.length);
});

// ============================================================
// INIT
// ============================================================

initTheme();
showPage("landing");

// Expose utile pour debug dans la console.
window.callWorkMateAI = callWorkMateAI;
window.callGroq = callGroq;
