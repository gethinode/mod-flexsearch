{{- $lazy := site.Params.modules.flexsearch.lazyLoad | default false -}}
const search = document.querySelector('.search-input')
const suggestions = document.querySelector('.search-suggestions')
const background = document.querySelector('.search-background')
const form = search !== null ? search.closest('.search') : null
const spinner = form !== null ? form.querySelector('.search-spinner') : null
const status = form !== null ? form.querySelector('.search-status') : null
const placeholder = search !== null ? search.placeholder : ''

const encoder = new FlexSearch.Encoder(FlexSearch.Charset.LatinSimple);
encoder.assign({ minlength: 3 });

var index = new FlexSearch.Document({
  tokenize: "forward",
  cache: 100,
  document: {
    id: "id",
    store: ["href", "title", "description"],
    index: [
      {
        field: "title",
        tokenize: "forward",
        resolution: 3
      },
      {
        field: "description",
        encoder: encoder,
        resolution: 20,
        tokenize: "full"
      },
      {
        field: "content",
        encoder: encoder,
        resolution: 20,
        tokenize: "full"
      }
    ]
  }
});

/*
  The index data is fetched from a standalone per-language JSON asset that is
  published by the assets/search-index.html partial via templates.Defer, i.e.
  after all pages have rendered. Keeping the payload out of the script bundle
  keeps the expensive index build off the render critical path. By default the
  fetch starts as soon as this script executes; with lazyLoad enabled it is
  postponed until the first search interaction. A data-search-index attribute
  on the search input (legacy lazy-mode layouts) overrides the built-in URL.

  Once the visitor interacts with the search input, the input reports the
  state of the index until it is ready: a spinner and a loading placeholder
  while it loads, or an unavailable placeholder when loading failed. A failed
  load is retried on the next interaction.
*/
let indexStatus = 'idle'; // idle | loading | ready | error
let engaged = false; // whether the visitor has interacted with the search input

function loadIndex() {
  if (indexStatus === 'loading' || indexStatus === 'ready') return;
  indexStatus = 'loading';
  search.setAttribute('aria-busy', 'true');
  renderStatus();

  const url = search.dataset.searchIndex || {{ partial "utilities/GetSearchIndex.html" . | jsonify }};

  fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(addDocs)
    .then(() => {
      indexStatus = 'ready';
      search.removeAttribute('aria-busy');
      search.addEventListener('input', showResults, true);
      renderStatus();
      // Honor a query typed while the index was still loading.
      if (search.value) showResults.call(search);
    })
    .catch((err) => {
      // Retrying is safe after a partial build: FlexSearch updates a document
      // whose id is already indexed instead of adding it twice.
      indexStatus = 'error';
      search.removeAttribute('aria-busy');
      renderStatus();
      console.error('flexsearch: failed to load search index', err);
    });
}

/*
  Adding documents is synchronous and CPU-bound: a multi-megabyte index takes
  seconds to build, which would block the main thread for the whole build and
  freeze the spinner and any typing along with it. Instead, add the documents in
  time-boxed slices and yield to the browser between slices, so it can paint and
  handle input. A slice overruns its budget by at most the time one document
  takes to add.
*/
const sliceBudget = 20; // milliseconds

function yieldToMain() {
  if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function addDocs(docs) {
  let i = 0;
  while (i < docs.length) {
    const deadline = performance.now() + sliceBudget;
    do {
      index.add(docs[i++]);
    } while (i < docs.length && performance.now() < deadline);
    if (i < docs.length) await yieldToMain();
  }
}

/*
  Reflects the state of the index in the search input. The spinner takes the
  place of the keyboard hint, which the stylesheet hides through the
  --search-hint-display property: an inline custom property cannot be purged
  from a production stylesheet, unlike a state class that only the runtime
  sets. Layouts that predate the indicator render no .search-spinner and skip
  this.
*/
function renderStatus() {
  if (spinner === null || status === null) return;

  const loading = engaged && indexStatus === 'loading';
  const failed = engaged && indexStatus === 'error';

  spinner.classList.toggle('d-none', !loading);
  if (loading) {
    form.style.setProperty('--search-hint-display', 'none');
  } else {
    form.style.removeProperty('--search-hint-display');
  }
  search.placeholder = loading ? status.dataset.loading : failed ? status.dataset.unavailable : placeholder;
  status.textContent = loading ? status.dataset.loading : failed ? status.dataset.unavailable : '';
}

// Handles a search interaction: loads the index when needed and reports its state.
function searchIntent() {
  engaged = true;
  loadIndex();
  renderStatus();
}

function hideSuggestions(e) {
  var isClickInsideElement = suggestions.contains(e.target);

  if (!isClickInsideElement) {
    suggestions.classList.add('d-none')
    if (background !== null ) {
      background.style.setProperty('--image-opacity', '0.1')
    }
  }
}

/*
Source:
  - https://raw.githubusercontent.com/h-enk/doks/master/assets/js/index.js
*/
function inputFocus(e) {
  if (e.ctrlKey && e.key === '/' ) {
    e.preventDefault();
    search.focus();
  }
  if (e.key === 'Escape' ) {
    search.blur();
    suggestions.classList.add('d-none');
  }
}

/*
Source:
  - https://dev.to/shubhamprakash/trap-focus-using-javascript-6a3
*/
function suggestionFocus(e) {
  const suggestionsHidden = suggestions.classList.contains('d-none');
  if (suggestionsHidden) return;

  const focusableSuggestions= [...suggestions.querySelectorAll('a')];
  if (focusableSuggestions.length === 0) return;

  const index = focusableSuggestions.indexOf(document.activeElement);

  if (e.key === "ArrowUp") {
    e.preventDefault();
    const nextIndex = index > 0 ? index - 1 : 0;
    focusableSuggestions[nextIndex].focus();
  }
  else if (e.key === "ArrowDown") {
    e.preventDefault();
    const nextIndex= index + 1 < focusableSuggestions.length ? index + 1 : index;
    focusableSuggestions[nextIndex].focus();
  }
}

/*
Source:
  - https://github.com/nextapps-de/flexsearch#index-documents-field-search
  - https://raw.githack.com/nextapps-de/flexsearch/master/demo/autocomplete.html
*/
function showResults() {
  const maxResult = 5;
  var searchQuery = this.value;
  // filter the results for the currently tagged language
  const lang = document.documentElement.lang;
  var results = null;
  if (searchQuery) {
    results = index.search(searchQuery, { index: ['title', 'description', 'content'], limit: maxResult, enrich: true });
    if (background !== null) {
      background.style.setProperty('--image-opacity', '0')
    }
  } else {
    if (background !== null) {
      background.style.setProperty('--image-opacity', '0.1')
    }
  }

  // flatten results since index.search() returns results for each indexed field
  const flatResults = new Map(); // keyed by href to dedupe results
  if (results !== null) {
    for (const result of results.flatMap(r => r.result)) {
      if (flatResults.has(result.doc.href)) continue;
      flatResults.set(result.doc.href, result.doc);
    }
  }

  suggestions.innerHTML = "";
  suggestions.classList.remove('d-none');

  // inform user that no results were found
  if (flatResults.size === 0 && searchQuery) {
    const msg = suggestions.dataset.noResults;
    const noResultsMessage = document.createElement('div')
    noResultsMessage.innerHTML = `${msg} "<strong>${searchQuery}</strong>"`
    noResultsMessage.classList.add("suggestion__no-results");
    suggestions.appendChild(noResultsMessage);
    return;
  }

  // construct a list of suggestions
  for (const [href, doc] of flatResults) {
    const entry = document.createElement('div');
    suggestions.appendChild(entry);

    const a = document.createElement('a');
    a.href = href;
    entry.appendChild(a);

    const title = document.createElement('span');
    title.classList.add('text-start');
    title.textContent = doc.title;
    title.classList.add("suggestion__title");
    a.appendChild(title);

    const description = document.createElement('span');
    description.textContent = doc.description;
    description.classList.add("suggestion__description");
    a.appendChild(description);

    suggestions.appendChild(entry);

    if (suggestions.childElementCount == maxResult) break;
  }
}

if (search !== null && suggestions !== null) {
  document.addEventListener('keydown', inputFocus);
  document.addEventListener('keydown', suggestionFocus);
  document.addEventListener('click', hideSuggestions);
  search.addEventListener('focus', searchIntent);
  search.addEventListener('click', searchIntent);
  search.addEventListener('input', searchIntent);
  {{- if not $lazy }}
  loadIndex();
  {{- end }}
}

const searchModal = document.getElementById('search-modal')
if (searchModal !== null) {
  searchModal.addEventListener('shown.bs.modal', function () {
    {{ if $lazy }}loadIndex();
    {{ end -}}
    const searchInput = document.getElementById('search-input-modal')
    if (searchInput !== null) {
      searchInput.focus({ focusVisible: true })
    }
  })
}
