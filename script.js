const API_ROOT = "https://en.wikipedia.org/w/api.php";

const searchForm = document.querySelector("#searchForm");
const heroSearchForm = document.querySelector("#heroSearchForm");
const searchInput = document.querySelector("#searchInput");
const heroSearchInput = document.querySelector("#heroSearchInput");
const hero = document.querySelector("#hero");
const workspace = document.querySelector("#workspace");
const resultsList = document.querySelector("#resultsList");
const resultCount = document.querySelector("#resultCount");
const reader = document.querySelector("#reader");

let activeTitle = "";

const stripHtml = (html = "") => {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent.trim();
};

const apiUrl = (params) => {
  const url = new URL(API_ROOT);
  url.search = new URLSearchParams({
    format: "json",
    origin: "*",
    ...params,
  });
  return url;
};

const apiFetch = (params) =>
  fetch(apiUrl(params), {
    headers: {
      "Api-User-Agent": "OpenKnowledge/1.0 (static GitHub Pages reader)",
    },
  });

const setRoute = (query, title) => {
  const url = new URL(window.location.href);
  if (query) {
    url.searchParams.set("q", query);
  }
  if (title) {
    url.searchParams.set("article", title);
  } else {
    url.searchParams.delete("article");
  }
  window.history.replaceState({}, "", url);
};

const showWorkspace = () => {
  hero.hidden = true;
  workspace.hidden = false;
};

const renderLoading = (message) => {
  reader.innerHTML = `
    <div class="reader-loading">
      <p>${message}</p>
    </div>
  `;
};

const renderError = (title, message) => {
  reader.innerHTML = `
    <div class="reader-error">
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
  `;
};

const sanitizeArticle = (html) => {
  const template = document.createElement("template");
  template.innerHTML = html;

  template.content
    .querySelectorAll("script, style, link, iframe, audio, video, form")
    .forEach((node) => node.remove());

  template.content
    .querySelectorAll(".mw-empty-elt, .ambox, .toc, .sidebar, .sistersitebox")
    .forEach((node) => node.remove());

  template.content.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.startsWith("/wiki/") && !href.includes(":")) {
      const title = decodeURIComponent(href.replace("/wiki/", "").replaceAll("_", " "));
      link.href = "#";
      link.dataset.articleTitle = title;
    } else if (href.startsWith("//")) {
      link.href = `https:${href}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else if (href.startsWith("/")) {
      link.href = `https://en.wikipedia.org${href}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else if (href.startsWith("http")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });

  return template.innerHTML;
};

const searchArticles = async (query, preferredTitle = "") => {
  const cleanQuery = query.trim();
  if (!cleanQuery) return;

  showWorkspace();
  searchInput.value = cleanQuery;
  heroSearchInput.value = cleanQuery;
  resultCount.textContent = "...";
  resultsList.innerHTML = "";
  renderLoading(`Searching for "${cleanQuery}"...`);

  try {
    const response = await apiFetch({
        action: "query",
        list: "search",
        srsearch: cleanQuery,
        srlimit: "10",
      });
    const data = await response.json();
    const results = data.query?.search || [];

    resultCount.textContent = String(results.length);
    resultsList.innerHTML = "";

    if (!results.length) {
      renderError("No results found", "Try a different term or a broader topic.");
      return;
    }

    results.forEach((result, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-item";
      button.dataset.title = result.title;
      button.innerHTML = `
        <strong>${result.title}</strong>
        <span>${stripHtml(result.snippet)}</span>
      `;
      button.addEventListener("click", () => loadArticle(result.title, cleanQuery));
      resultsList.append(button);

      if (index === 0 && !preferredTitle) {
        loadArticle(result.title, cleanQuery);
      }
    });

    if (preferredTitle) {
      loadArticle(preferredTitle, cleanQuery);
    }
  } catch (error) {
    console.error(error);
    resultCount.textContent = "0";
    renderError("Search unavailable", "The article service could not be reached. Please try again shortly.");
  }
};

const loadArticle = async (title, query = searchInput.value) => {
  activeTitle = title;
  renderLoading(`Opening "${title}"...`);
  document.querySelectorAll(".result-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.title === title);
  });
  setRoute(query, title);

  try {
    const response = await apiFetch({
        action: "parse",
        page: title,
        prop: "text|displaytitle|revid",
        redirects: "1",
      });
    const data = await response.json();
    const page = data.parse;

    if (!page?.text?.["*"]) {
      renderError("Article unavailable", "This topic could not be opened in the reader.");
      return;
    }

    const sourceUrl = `https://en.wikipedia.org/?curid=${page.pageid}`;
    const editUrl = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(page.title)}&action=history`;

    reader.innerHTML = `
      <header class="article-header">
        <h1 class="article-title">${page.displaytitle || page.title}</h1>
        <div class="article-meta">
          <span>Revision ${page.revid}</span>
          <span aria-hidden="true">/</span>
          <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Original article</a>
          <span aria-hidden="true">/</span>
          <a href="${editUrl}" target="_blank" rel="noopener noreferrer">Contributor history</a>
        </div>
      </header>
      <div class="article-layout">
        <div class="article-body">${sanitizeArticle(page.text["*"])}</div>
        <aside class="source-card" aria-label="Source and license">
          <h2>Source & License</h2>
          <p>
            This article text comes from Wikipedia contributors and is reused
            under the <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="license noopener noreferrer">CC BY-SA license</a>.
          </p>
          <p>
            OpenKnowledge is an independent reader and is not affiliated with or
            endorsed by the Wikimedia Foundation.
          </p>
        </aside>
      </div>
    `;

    reader.querySelectorAll("[data-article-title]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const nextTitle = event.currentTarget.dataset.articleTitle;
        searchInput.value = nextTitle;
        heroSearchInput.value = nextTitle;
        searchArticles(nextTitle, nextTitle);
      });
    });

    if (window.matchMedia("(min-width: 861px)").matches) {
      reader.scrollIntoView({ block: "start", behavior: "auto" });
    }
  } catch (error) {
    console.error(error);
    renderError("Article unavailable", "The selected article could not be loaded. Please try another result.");
  }
};

const bindSearch = (form, input) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    searchArticles(input.value);
  });
};

bindSearch(searchForm, searchInput);
bindSearch(heroSearchForm, heroSearchInput);

const params = new URLSearchParams(window.location.search);
const initialQuery = params.get("q");
const initialArticle = params.get("article");

if (initialQuery) {
  searchArticles(initialQuery, initialArticle || "");
}
