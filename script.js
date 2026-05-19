const SOURCES = {
  wikipedia: {
    label: "Wikipedia",
    apiRoot: "https://en.wikipedia.org/w/api.php",
    siteRoot: "https://en.wikipedia.org",
    articleBase: "https://en.wikipedia.org/?curid=",
    historyBase: "https://en.wikipedia.org/w/index.php",
    license: "CC BY-SA",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    description: "Encyclopedia articles from Wikipedia contributors.",
  },
  wikinews: {
    label: "Wikinews",
    apiRoot: "https://en.wikinews.org/w/api.php",
    siteRoot: "https://en.wikinews.org",
    articleBase: "https://en.wikinews.org/?curid=",
    historyBase: "https://en.wikinews.org/w/index.php",
    license: "CC BY",
    licenseUrl: "https://creativecommons.org/licenses/by/2.5/",
    description: "Open news reports from Wikinews contributors.",
  },
  wikibooks: {
    label: "Wikibooks",
    apiRoot: "https://en.wikibooks.org/w/api.php",
    siteRoot: "https://en.wikibooks.org",
    articleBase: "https://en.wikibooks.org/?curid=",
    historyBase: "https://en.wikibooks.org/w/index.php",
    license: "CC BY-SA",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    description: "Open textbooks and learning material from Wikibooks contributors.",
  },
  wikivoyage: {
    label: "Wikivoyage",
    apiRoot: "https://en.wikivoyage.org/w/api.php",
    siteRoot: "https://en.wikivoyage.org",
    articleBase: "https://en.wikivoyage.org/?curid=",
    historyBase: "https://en.wikivoyage.org/w/index.php",
    license: "CC BY-SA",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    description: "Open travel guides from Wikivoyage contributors.",
  },
};

const DEFAULT_SOURCE = "wikipedia";

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
let activeSource = DEFAULT_SOURCE;

const getSource = (sourceKey = DEFAULT_SOURCE) => SOURCES[sourceKey] || SOURCES[DEFAULT_SOURCE];

const escapeHtml = (text = "") => {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
};

const stripHtml = (html = "") => {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent.trim();
};

const apiUrl = (sourceKey, params) => {
  const url = new URL(getSource(sourceKey).apiRoot);
  url.search = new URLSearchParams({
    format: "json",
    origin: "*",
    ...params,
  });
  return url;
};

const apiFetch = (sourceKey, params) =>
  fetch(apiUrl(sourceKey, params), {
    headers: {
      "Api-User-Agent": "OpenKnowledge/1.0 (static GitHub Pages reader)",
    },
  });

const setRoute = (query, title, sourceKey = DEFAULT_SOURCE) => {
  const url = new URL(window.location.href);
  if (query) {
    url.searchParams.set("q", query);
  }
  if (title) {
    url.searchParams.set("article", title);
    url.searchParams.set("source", sourceKey);
  } else {
    url.searchParams.delete("article");
    url.searchParams.delete("source");
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

const sanitizeArticle = (html, sourceKey = DEFAULT_SOURCE) => {
  const source = getSource(sourceKey);
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
      link.href = `${source.siteRoot}${href}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else if (href.startsWith("http")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });

  return template.innerHTML;
};

const searchSource = async (sourceKey, query) => {
  const response = await apiFetch(sourceKey, {
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "6",
  });
  const data = await response.json();
  return (data.query?.search || []).map((result) => ({
    ...result,
    sourceKey,
  }));
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
    const searchTasks = Object.keys(SOURCES).map((sourceKey) => searchSource(sourceKey, cleanQuery));
    const settledResults = await Promise.allSettled(searchTasks);
    const results = settledResults
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => result.value)
      .slice(0, 18);

    resultCount.textContent = String(results.length);
    resultsList.innerHTML = "";

    if (!results.length) {
      renderError("No results found", "Try a different term or a broader topic.");
      return;
    }

    results.forEach((result, index) => {
      const source = getSource(result.sourceKey);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-item";
      button.dataset.title = result.title;
      button.dataset.source = result.sourceKey;
      button.innerHTML = `
        <small>${source.label}</small>
        <strong>${escapeHtml(result.title)}</strong>
        <span>${escapeHtml(stripHtml(result.snippet))}</span>
      `;
      button.addEventListener("click", () => loadArticle(result.title, cleanQuery, result.sourceKey));
      resultsList.append(button);

      if (index === 0 && !preferredTitle) {
        loadArticle(result.title, cleanQuery, result.sourceKey);
      }
    });

    if (preferredTitle) {
      loadArticle(preferredTitle, cleanQuery, activeSource);
    }
  } catch (error) {
    console.error(error);
    resultCount.textContent = "0";
    renderError("Search unavailable", "The article service could not be reached. Please try again shortly.");
  }
};

const loadArticle = async (title, query = searchInput.value, sourceKey = DEFAULT_SOURCE) => {
  const source = getSource(sourceKey);
  activeTitle = title;
  activeSource = sourceKey;
  renderLoading(`Opening "${title}" from ${source.label}...`);
  document.querySelectorAll(".result-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.title === title && item.dataset.source === sourceKey);
  });
  setRoute(query, title, sourceKey);

  try {
    const response = await apiFetch(sourceKey, {
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

    const sourceUrl = `${source.articleBase}${page.pageid}`;
    const editUrl = `${source.historyBase}?title=${encodeURIComponent(page.title)}&action=history`;

    reader.innerHTML = `
      <header class="article-header">
        <p class="article-source">${source.label}</p>
        <h1 class="article-title">${page.displaytitle || escapeHtml(page.title)}</h1>
        <div class="article-meta">
          <span>Revision ${page.revid}</span>
          <span aria-hidden="true">/</span>
          <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Original article</a>
          <span aria-hidden="true">/</span>
          <a href="${editUrl}" target="_blank" rel="noopener noreferrer">Contributor history</a>
        </div>
      </header>
      <div class="article-layout">
        <div class="article-body">${sanitizeArticle(page.text["*"], sourceKey)}</div>
        <aside class="source-card" aria-label="Source and license">
          <h2>Source & License</h2>
          <p>
            ${source.description} Content is reused under the
            <a href="${source.licenseUrl}" target="_blank" rel="license noopener noreferrer">${source.license} license</a>.
          </p>
          <p>
            OpenKnowledge is an independent reader and is not affiliated with or
            endorsed by any source project.
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
        activeSource = sourceKey;
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
activeSource = params.get("source") || DEFAULT_SOURCE;

if (initialQuery) {
  searchArticles(initialQuery, initialArticle || "");
}
