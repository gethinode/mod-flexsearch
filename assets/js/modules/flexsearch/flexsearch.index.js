const search = document.querySelector('.search-input')
const suggestions = document.querySelector('.search-suggestions')
const background = document.querySelector('.search-background')

var index = new FlexSearch.Document({
  tokenize: "forward",
  cache: 100,
  document: {
    id: "id",
    tag: "tag",
    store: ["href", "title", "description"],
    index: ["title", "description", "content"]
  }
});

/*
Source:
  - https://github.com/nextapps-de/flexsearch#index-documents-field-search
  - https://raw.githack.com/nextapps-de/flexsearch/master/demo/autocomplete.html
*/
function initIndex() {
  // https://discourse.gohugo.io/t/range-length-or-last-element/3803/2
  // Note: uses .Site.AllPages as .Site.RegularPages only returns content for the current language;
  //       pages without a title (such as browserconfig.xml) are excluded
  {{ $list := where site.AllPages "Title" "!=" "" }}
  {{ $list = where $list ".Params.searchExclude" "!=" true }}
  {{ $len := (len $list) -}}

  {{ if gt $len 0 }}
  index.add(
    {{ range $index, $element := sort $list "Title" "asc" -}}
      {{ $url := .RelPermalink }}
      {{ if site.Params.modules.flexsearch.canonifyURLs }}{{ $url = .Permalink }}{{ end }}
      {
        id: {{ $index }},
        tag: "{{ .Lang }}",
        href: "{{ $url }}",
        title: {{ .Title | jsonify }},
        {{ with .Description -}}
          description: {{ . | jsonify }},
        {{ else -}}
          description: {{ .Summary | plainify | jsonify }},
        {{ end -}}
        {{ $content := (replaceRE "[{}]" "" .Plain) }}
        {{ if site.Params.modules.flexsearch.frontmatter }}
          {{ $key := site.Params.modules.flexsearch.filter | default "params" }}
          {{ $val := slice }}
          {{ if ne $key "params" }}{{ $val = index .Params $key }}{{ else }}{{ $val = .Params }}{{ end }}
          {{ $content = printf "%s %s" (partial "assets/search-meta.html" (dict "key" $key "val" $val)) $content }}
        {{ end }}
        content: {{ trim $content " \r\n" | jsonify }}
      })
      {{ if ne (add $index 1) $len -}}
        .add(
      {{ end -}}
    {{ end -}}
  ;
  {{ end }}

  search.addEventListener('input', showResults, true);
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
    results = index.search(searchQuery, { index: ['title', 'description', 'content'], limit: maxResult, tag: lang, enrich: true });
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
  initIndex();
}

const searchModal = document.getElementById('search-modal')
if (searchModal !== null) {
  searchModal.addEventListener('shown.bs.modal', function () {
    const searchInput = document.getElementById('search-input-modal')
    if (searchInput !== null) {
      searchInput.focus({ focusVisible: true })
    }
  })
}
