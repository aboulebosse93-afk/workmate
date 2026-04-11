// ============================================================
//  WorkMate — app.js
//  Firebase Auth + Firestore + Groq API (100% gratuit)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
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
  orderBy,
  limit,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
//  🔧 TA CONFIG FIREBASE — remplace les valeurs ci-dessous
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyClJGReIQ3s2h18HST8r6PmayeBSGJX_zw",
  authDomain: "workmate-3c68c.firebaseapp.com",
  projectId: "workmate-3c68c",
  storageBucket: "workmate-3c68c.firebasestorage.app",
  messagingSenderId: "106648534705",
  appId: "1:106648534705:web:79c1af55ebf3dbe7972c90"
};

// ============================================================
//  🔧 TA CLÉ GROQ — remplace par ta vraie clé gsk_...
// ============================================================
const GROQ_API_KEY = "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";

// ---- Init Firebase ----
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ---- State ----
let currentUser = null;
let userProfile = null;
const tasks = [];

// ============================================================
//  AUTH STATE
// ============================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserProfile(user);
    showPage("app");
    switchView("dashboard");
    loadDashboard();
  } else {
    currentUser = null;
    showPage("landing");
  }
});

// ============================================================
//  PROFIL
// ============================================================
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
      usage: { total: 0, reunion: 0, email: 0, focus: 0, month: currentMonth() },
      createdAt: serverTimestamp()
    };
    await setDoc(ref, userProfile);
  }
  updateUIWithProfile();
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function updateUIWithProfile() {
  if (!userProfile) return;
  const name = `${userProfile.firstname || ""} ${userProfile.lastname || ""}`.trim() || userProfile.email;
  const initials = name.slice(0, 2).toUpperCase();

  document.getElementById("user-display-name").textContent = name;
  document.getElementById("user-avatar-initials").textContent = initials;
  document.getElementById("profile-name").textContent = name;
  document.getElementById("profile-email").textContent = userProfile.email;
  document.getElementById("profile-firstname").value = userProfile.firstname || "";
  document.getElementById("profile-lastname").value = userProfile.lastname || "";
  document.getElementById("profile-email-input").value = userProfile.email || "";
  document.getElementById("profile-avatar").textContent = initials;

  const usage = userProfile.usage || {};
  const monthUsage = usage.month === currentMonth() ? (usage.total || 0) : 0;
  const lim = 50; // Groq est gratuit, on met 50/mois
  const pct = Math.min((monthUsage / lim) * 100, 100);
  document.getElementById("plan-detail-text").textContent =
    `${monthUsage} analyse${monthUsage > 1 ? "s" : ""} utilisée${monthUsage > 1 ? "s" : ""} sur ${lim} ce mois`;
  document.getElementById("usage-fill-bar").style.width = pct + "%";
  document.getElementById("usage-text-detail").textContent =
    `${lim - monthUsage} analyses restantes ce mois`;
  document.getElementById("usage-badge").textContent =
    `Plan Gratuit — ${monthUsage}/${lim} analyses`;
}

// ============================================================
//  DASHBOARD
// ============================================================
async function loadDashboard() {
  if (!currentUser) return;
  const usage = userProfile?.usage || {};
  const m = usage.month === currentMonth() ? usage : { total: 0, reunion: 0, email: 0, focus: 0 };
  document.getElementById("stat-total").textContent = m.total || 0;
  document.getElementById("stat-reunion").textContent = m.reunion || 0;
  document.getElementById("stat-email").textContent = m.email || 0;
  document.getElementById("stat-focus").textContent = m.focus || 0;
  await loadHistory(5, "recent-list");
}

async function loadHistory(limitCount = 50, targetId = "history-list") {
  const target = document.getElementById(targetId);
  target.innerHTML = loadingHTML();
  try {
    const q = query(
      collection(db, "analyses"),
      where("uid", "==", currentUser.uid),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      target.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text2);font-size:.88rem">Aucune analyse pour l'instant. Utilise un outil pour commencer !</div>`;
      return;
    }
    const icons = {
      reunion: { icon: "💼", cls: "fi-purple" },
      email: { icon: "📧", cls: "fi-red" },
      focus: { icon: "🧩", cls: "fi-green" }
    };
    target.innerHTML = snap.docs.map(d => {
      const data = d.data();
      const t = icons[data.type] || { icon: "📄", cls: "fi-purple" };
      const date = data.createdAt?.toDate ? timeAgo(data.createdAt.toDate()) : "—";
      return `<div class="history-item" data-type="${data.type}">
        <div class="hi-icon ${t.cls}">${t.icon}</div>
        <div class="hi-info"><div class="hi-title">${data.title || "Sans titre"}</div><div class="hi-meta">${data.summary || ""}</div></div>
        <div class="hi-date">${date}</div>
      </div>`;
    }).join("");
  } catch (e) {
    target.innerHTML = `<div style="padding:1.5rem;color:var(--accent2);text-align:center">Erreur de chargement.</div>`;
  }
}

function timeAgo(date) {
  const s = Math.floor((new Date() - date) / 1000);
  if (s < 60) return "À l'instant";
  if (s < 3600) return `Il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `Il y a ${Math.floor(s / 3600)}h`;
  if (s < 604800) return `Il y a ${Math.floor(s / 86400)} jour${Math.floor(s / 86400) > 1 ? "s" : ""}`;
  return date.toLocaleDateString("fr-FR");
}

async function saveAnalysis(type, title, summary, content) {
  if (!currentUser) return;
  try {
    await addDoc(collection(db, "analyses"), {
      uid: currentUser.uid, type, title, summary, content,
      createdAt: serverTimestamp()
    });
    const ref = doc(db, "users", currentUser.uid);
    const snap = await getDoc(ref);
    const data = snap.data();
    const usage = data.usage || {};
    const isCurrent = usage.month === currentMonth();
    const newUsage = {
      month: currentMonth(),
      total: (isCurrent ? (usage.total || 0) : 0) + 1,
      reunion: (isCurrent ? (usage.reunion || 0) : 0) + (type === "reunion" ? 1 : 0),
      email: (isCurrent ? (usage.email || 0) : 0) + (type === "email" ? 1 : 0),
      focus: (isCurrent ? (usage.focus || 0) : 0) + (type === "focus" ? 1 : 0),
    };
    await updateDoc(ref, { usage: newUsage });
    userProfile.usage = newUsage;
    updateUIWithProfile();
  } catch (e) { console.error("Erreur sauvegarde:", e); }
}

// ============================================================
//  GROQ API (100% gratuit)
// ============================================================
async function callGroq(prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1000,
      messages: [
        { role: "system", content: "Tu es un assistant de productivité expert. Tu réponds toujours en français." },
        { role: "user", content: prompt }
      ]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

// ============================================================
//  OUTILS
// ============================================================
window.analyzeReunion = async function () {
  const text = document.getElementById("reunion-input").value.trim();
  if (!text) return alert("Colle tes notes d'abord !");
  const box = document.getElementById("reunion-result");
  const body = document.getElementById("reunion-body");
  box.classList.add("visible");
  body.innerHTML = loadingHTML();
  try {
    const r = await callGroq(`Analyse ces notes de réunion et structure ta réponse EXACTEMENT ainsi :

📋 DÉCISIONS PRISES
• [décisions claires, une par ligne]

✅ TÂCHES À FAIRE
• [Tâche] — Responsable : [nom si mentionné] — Deadline : [si mentionnée]

❓ POINTS FLOUS À CLARIFIER
• [ambiguïtés ou questions non résolues]

💡 RECOMMANDATION
[une recommandation rapide pour le suivi]

Notes : ${text}`);
    body.textContent = r;
    await saveAnalysis("reunion", `Réunion — ${text.slice(0, 40)}...`, "Analyse complète", r);
  } catch (e) {
    body.innerHTML = `<span style="color:var(--accent2)">Erreur : ${e.message}</span>`;
  }
};

window.generateEmail = async function () {
  const text = document.getElementById("email-input").value.trim();
  if (!text) return alert("Décris ta situation d'abord !");
  const box = document.getElementById("email-result");
  const vars = document.getElementById("email-variants");
  box.classList.add("visible");
  vars.innerHTML = loadingHTML();
  try {
    const r = await callGroq(`Rédige 3 versions d'email en français avec ce format EXACT :

VERSION 1 — Ton direct et factuel
[email complet avec Objet:]

---

VERSION 2 — Ton empathique et diplomatique
[email complet avec Objet:]

---

VERSION 3 — Ton assertif et orienté solution
[email complet avec Objet:]

Situation : ${text}`);

    const parts = r.split("---").map(v => v.trim()).filter(Boolean);
    vars.innerHTML = `<div class="variants">` + parts.map((v, i) => {
      const lines = v.split("\n");
      const label = lines[0].replace(/VERSION \d+ — ?/, "").trim();
      const body = lines.slice(1).join("\n").trim();
      return `<div class="variant-card">
        <div class="variant-tag">Version ${i + 1} — ${label}</div>
        <div class="variant-text">${body}</div>
        <button class="copy-btn" onclick="copyRaw(this,\`${body.replace(/`/g, "\\`")}\`)">Copier</button>
      </div>`;
    }).join("") + `</div>`;
    await saveAnalysis("email", `Email — ${text.slice(0, 40)}...`, "3 versions générées", r);
  } catch (e) {
    vars.innerHTML = `<div style="padding:1.5rem;color:var(--accent2)">Erreur : ${e.message}</div>`;
  }
};

window.analyzeFocus = async function () {
  if (!tasks.length) return alert("Ajoute au moins une tâche !");
  const box = document.getElementById("focus-result");
  const body = document.getElementById("focus-body");
  box.classList.add("visible");
  body.innerHTML = loadingHTML();
  try {
    const r = await callGroq(`Organise ces tâches avec ce format EXACT :

🎯 PRIORITÉ ABSOLUE (à faire en premier)
• [tâche] — ⏱ ~[durée]
  → [sous-étapes si complexe]

⚡ IMPORTANT (à caser dans la journée)
• [tâche] — ⏱ ~[durée]

📅 PEUT ATTENDRE (reporter si besoin)
• [tâche]

💡 CONSEIL DU JOUR
[conseil personnalisé et actionnable]

Tâches : ${tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}`);
    body.textContent = r;
    await saveAnalysis("focus", `Focus — ${new Date().toLocaleDateString("fr-FR")}`, `${tasks.length} tâche(s) organisée(s)`, r);
  } catch (e) {
    body.innerHTML = `<span style="color:var(--accent2)">Erreur : ${e.message}</span>`;
  }
};

// ============================================================
//  TASKS
// ============================================================
window.addTask = function () {
  const inp = document.getElementById("task-input");
  const val = inp.value.trim();
  if (!val) return;
  tasks.push(val); inp.value = ""; renderTasks();
};
window.removeTask = function (i) { tasks.splice(i, 1); renderTasks(); };
function renderTasks() {
  document.getElementById("tasks-chips").innerHTML = tasks.map((t, i) =>
    `<div class="task-chip"><span>${t}</span><button class="task-del" onclick="removeTask(${i})">✕</button></div>`
  ).join("");
}

// ============================================================
//  AUTH
// ============================================================
window.doLogin = async function () {
  const email = document.getElementById("login-email").value;
  const pass = document.getElementById("login-pass").value;
  const btn = document.getElementById("btn-login");
  const err = document.getElementById("auth-error");
  err.style.display = "none"; btn.disabled = true; btn.textContent = "Connexion...";
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    err.textContent = translateError(e.code); err.style.display = "block";
    btn.disabled = false; btn.textContent = "Se connecter →";
  }
};

window.doSignup = async function () {
  const firstname = document.getElementById("signup-firstname").value;
  const lastname = document.getElementById("signup-lastname").value;
  const email = document.getElementById("signup-email").value;
  const pass = document.getElementById("signup-pass").value;
  const btn = document.getElementById("btn-signup");
  const err = document.getElementById("signup-error");
  err.style.display = "none";
  if (pass.length < 8) { err.textContent = "Mot de passe trop court (min. 8 caractères)."; err.style.display = "block"; return; }
  btn.disabled = true; btn.textContent = "Création...";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid, email, firstname, lastname, plan: "free",
      usage: { total: 0, reunion: 0, email: 0, focus: 0, month: currentMonth() },
      createdAt: serverTimestamp()
    });
  } catch (e) {
    err.textContent = translateError(e.code); err.style.display = "block";
    btn.disabled = false; btn.textContent = "Créer mon compte →";
  }
};

window.doGoogleLogin = async function () {
  try { await signInWithPopup(auth, googleProvider); } catch (e) { console.error(e); }
};

window.doLogout = async function () { await signOut(auth); };

window.doResetPassword = async function () {
  const email = prompt("Entre ton email :");
  if (!email) return;
  try { await sendPasswordResetEmail(auth, email); alert("Email envoyé ! Vérifie ta boîte mail."); }
  catch (e) { alert("Erreur : " + translateError(e.code)); }
};

// ============================================================
//  PROFIL ACTIONS
// ============================================================
window.saveProfile = async function () {
  if (!currentUser) return;
  const firstname = document.getElementById("profile-firstname").value.trim();
  const lastname = document.getElementById("profile-lastname").value.trim();
  const msg = document.getElementById("profile-msg");
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { firstname, lastname });
    userProfile.firstname = firstname; userProfile.lastname = lastname;
    updateUIWithProfile();
    msg.textContent = "✓ Profil sauvegardé !"; msg.style.color = "var(--accent3)"; msg.style.display = "block";
    setTimeout(() => msg.style.display = "none", 3000);
  } catch (e) {
    msg.textContent = "Erreur."; msg.style.color = "var(--accent2)"; msg.style.display = "block";
  }
};

window.changePassword = async function () {
  const np = document.getElementById("new-pass").value;
  const cp = document.getElementById("confirm-pass").value;
  const msg = document.getElementById("pass-msg");
  if (np !== cp) { msg.textContent = "Les mots de passe ne correspondent pas."; msg.style.color = "var(--accent2)"; msg.style.display = "block"; return; }
  if (np.length < 8) { msg.textContent = "Min. 8 caractères."; msg.style.color = "var(--accent2)"; msg.style.display = "block"; return; }
  try {
    await updatePassword(auth.currentUser, np);
    msg.textContent = "✓ Mot de passe changé !"; msg.style.color = "var(--accent3)"; msg.style.display = "block";
    document.getElementById("new-pass").value = ""; document.getElementById("confirm-pass").value = "";
    setTimeout(() => msg.style.display = "none", 3000);
  } catch (e) {
    msg.textContent = translateError(e.code); msg.style.color = "var(--accent2)"; msg.style.display = "block";
  }
};

// ============================================================
//  NAVIGATION
// ============================================================
window.showPage = function (id) {
  document.querySelectorAll(".page").forEach(p => { p.classList.remove("active"); p.style.display = "none"; });
  const p = document.getElementById("page-" + id);
  p.style.display = "flex";
  requestAnimationFrame(() => p.classList.add("active"));
};
window.showAuth = function (mode) { showPage("auth"); toggleAuth(mode); };
window.toggleAuth = function (mode) {
  document.getElementById("auth-login").style.display = mode === "login" ? "block" : "none";
  document.getElementById("auth-signup").style.display = mode === "signup" ? "block" : "none";
};

const viewTitles = {
  dashboard: "Dashboard", reunion: "💼 ReunionZero", email: "📧 MailTon",
  focus: "🧩 FocusBot", history: "🕐 Historique", profile: "👤 Profil", "pricing-app": "⚡ Passer au Pro"
};

window.switchView = function (name) {
  document.querySelectorAll(".app-view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".sidebar-item").forEach(b => b.classList.remove("active"));
  const v = document.getElementById("view-" + name);
  if (v) v.classList.add("active");
  const sb = document.getElementById("sb-" + name);
  if (sb) sb.classList.add("active");
  document.getElementById("topbar-title").textContent = viewTitles[name] || "";
  if (name === "history") loadHistory(50, "history-list");
  if (name === "dashboard") loadDashboard();
};

window.filterHistory = function (btn, type) {
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll("#history-list .history-item").forEach(item => {
    item.style.display = (type === "all" || item.dataset.type === type) ? "flex" : "none";
  });
};

// ============================================================
//  UTILS
// ============================================================
function loadingHTML() {
  return `<div class="loading-row"><div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><span>L'IA analyse...</span></div>`;
}
window.copyEl = function (id) { navigator.clipboard.writeText(document.getElementById(id).textContent); };
window.copyRaw = function (btn, text) {
  navigator.clipboard.writeText(text);
  btn.textContent = "✓ Copié !"; setTimeout(() => btn.textContent = "Copier", 2000);
};

function translateError(code) {
  const e = {
    "auth/user-not-found": "Aucun compte avec cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/email-already-in-use": "Cet email est déjà utilisé.",
    "auth/invalid-email": "Email invalide.",
    "auth/weak-password": "Mot de passe trop faible.",
    "auth/requires-recent-login": "Reconnecte-toi pour effectuer cette action.",
    "auth/invalid-credential": "Email ou mot de passe incorrect."
  };
  return e[code] || "Une erreur s'est produite. Réessaie.";
}

document.getElementById("reunion-input")?.addEventListener("input", function () {
  document.getElementById("reunion-chars").textContent = this.value.length;
});
document.getElementById("email-input")?.addEventListener("input", function () {
  document.getElementById("email-chars").textContent = this.value.length;
});

// Init
showPage("landing");
