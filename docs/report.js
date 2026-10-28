// Both documents share section IDs. Keep the reader at the same chapter.
// Plain links still work when JavaScript is disabled, including offline.
function updateLanguageLinks(hash = window.location.hash) {
  for (const link of document.querySelectorAll("[data-report-language]")) {
    const filename = link.dataset.reportLanguage === "en"
      ? "ai-service-explained.en.html"
      : "ai-service-explained.html";
    link.setAttribute("href", filename + hash);
  }
}

updateLanguageLinks();
window.addEventListener("hashchange", () => updateLanguageLinks());

// Scrolling without using the contents should keep the current chapter too.
document.querySelector(".language-links")?.addEventListener("click", () => {
  const top = document.querySelector(".report-language").getBoundingClientRect().bottom + 24;
  let hash = "";
  for (const section of document.querySelectorAll("main > section[id]")) {
    if (section.getBoundingClientRect().top > top) break;
    hash = "#" + section.id;
  }
  updateLanguageLinks(hash);
});
