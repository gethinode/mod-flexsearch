{{- $lazy := site.Params.modules.flexsearch.lazyLoad | default false -}}
const search = document.querySelector('.search-input')
const suggestions = document.querySelector('.search-suggestions')
const background = document.querySelector('.search-background')

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

{{ if $lazy -}}
/*
  Lazy mode: the index data is fetched from a standalone JSON resource the
  first time the user interacts with search, instead of being bundled into
  every page. The data URL is read from the search input's data-search-index
  attribute (set by the search-input / ModalSearch layouts).
*/
let indexStatus = 'idle'; // idle | loading | ready | error

function loadIndex() {
  if (indexStatus !== 'idle') return;
  indexStatus = 'loading';

  const url = search.dataset.searchIndex;
  if (!url) {
    indexStatus = 'error';
    console.error('flexsearch: missing data-search-index URL on the search input');
    return;
  }

  fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((docs) => {
      for (const doc of docs) index.add(doc);
      indexStatus = 'ready';
      search.addEventListener('input', showResults, true);
      // Honor a query typed while the index was still loading.
      if (search.value) showResults.call(search);
    })
    .catch((err) => {
      indexStatus = 'error';
      console.error('flexsearch: failed to load search index', err);
    });
}
{{- else -}}
/*
Source:
  - https://github.com/nextapps-de/flexsearch#index-documents-field-search
  - https://raw.githack.com/nextapps-de/flexsearch/master/demo/autocomplete.html
*/
function initIndex() {
  {{- range $doc := partial "utilities/GetSearchDocs.html" . }}
  index.add({{ $doc | jsonify }});
  {{- end }}
  search.addEventListener('input', showResults, true);
}
{{- end }}

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
  {{ if $lazy -}}
  search.addEventListener('focus', loadIndex, { once: true });
  search.addEventListener('click', loadIndex, { once: true });
  {{- else -}}
  initIndex();
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
