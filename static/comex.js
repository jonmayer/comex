// LOCATION is a stack of directories being viewed.
var LOCATION = [""];
// FOLDERS is a JSON map of information about folders.
var FOLDERS = {};
// IMAGES is a cache of images that we might display to the user.
var IMAGES = [];
var ZOOM=100;
var CURRENT_PAGE=0;

const THUMBWIDTH="90pt";

// get_folder returns a promise
function get_folder(path, depth = 0) {
  // TODO: trim old data from FOLDERS.
  if (path in FOLDERS) { return Promise.resolve(); }

  if (path == "") { path = "ROOT/"; }
  console.log(`Fetching /folder/${path}?depth=${depth}`);
  return fetch(`/folder/${path}?depth=${depth}`)
    .then(
      function(response) {
        console.log(`Fetched /folder/${path}`);
        console.log(response.status);
        console.log(response.statusText);
        console.log(response.type);
        console.log(response.url);
        if (response.status !== 200) {
          console.log('Looks like there was a problem. Status Code: ' +
            response.status);
          return Promise.reject("Status Code " + response.status);
        }
        // Examine the text in the response
        return response.json().then(function(data) {
          FOLDERS = Object.assign({}, FOLDERS, data["map"]);
          console.log(FOLDERS);
          return Promise.resolve();
        });
      }
    );
}

function reload_folder_data() {
  // Let's use the new Fetch API to grab our json data.
  get_folder("", 0).then(render)
    .catch(function(err) {
      console.log('Fetch Error :-S', err);
    });
}

function render() {
  render_navbar();
  render_image();
}

// thumbnail for subfolders:
function dummy_thumbnail(index) {
  return `
    <figure id="thumbnail_${index}">
    Loading...
    </figure>
    `;
}

function update_thumbnail_resolved(index, path) {
  if (!(path in FOLDERS)) {
    console.log(`Missing "${path}" in FOLDERS`);
    return;
  }
  var kid_metadata = FOLDERS[path];
  var src = to_image_url(kid_metadata.cover);
  var title = kid_metadata.title;
  var fig = document.getElementById(`thumbnail_${index}`);
  fig.onclick = function() {change_dir(path)};
  fig.onmouseover = function() {view(src)};
  fig.innerHTML = `
    <img loading=lazy
     src="${src}"
     alt="${title}"
     width="${THUMBWIDTH}"
    />
    <figurecaption>${title}</figurecaption>
    `;
  if (CURRENT_PAGE === index) {
    viewpage(index);
  }
  return;
}

// thumbnail for pages:
function pagenail(index, src, title) {
  return `
    <figure
   onclick="viewpage(${index})"
   id="pagenail_${index}"
    >
    <img loading=lazy
   src="${src}"
   alt="${title}"
   width="${THUMBWIDTH}"
    />
    </figure>
    `;
}

function change_dir(path) {
  LOCATION.push(path);
  CURRENT_PAGE = 0;  // always start at first page.
  render();
}

function view(src) {
  document.getElementById('main').innerHTML = `
    <img loading=lazy
   src="${src}"
    />
    `;
}

function set_current_page(index) {
  var oldthumb = document.getElementById(`pagenail_${CURRENT_PAGE}`);
  if (oldthumb != null) {
    oldthumb.classList.remove('page_highlight');
  }
  var newthumb = document.getElementById(`pagenail_${index}`);
  if (newthumb != null) {
    newthumb.classList.add('page_highlight');
  }
  CURRENT_PAGE = index;
  document.getElementById(`pagenail_${index}`).scrollIntoView();
  refresh_page();
}

function viewpage(index) {
  var path = LOCATION.slice(-1)[0];
  if (path in FOLDERS) {
    viewpage_resolved(index);
  } else {
    get_folder(path).then(function () { viewpage_resolved(index); });
  }
}

function viewpage_resolved(index) {
  var path = LOCATION.slice(-1)[0];
  var metadata = FOLDERS[path];
  if (index >= metadata.pages.length) {
    index = metadata.pages.length - 1;
  }
  if (index < 0) { index = 0; }
  set_current_page(index);
}

function refresh_page() {
  var path = LOCATION.slice(-1)[0];
  if (path in FOLDERS) {
    refresh_page_resolved();
  } else {
    get_folder(path).then(refresh_page_resolved());
  }
}

function refresh_page_resolved() {
  // TODO: handle no pages condition.
  var path = LOCATION.slice(-1)[0];
  var metadata = FOLDERS[path];
  var src = to_image_url(metadata.pages[CURRENT_PAGE]);
  var next = CURRENT_PAGE + 1;
  var prev = CURRENT_PAGE - 1;
  var elem = document.getElementById('main');
  elem.innerHTML = `
    <img loading=lazy
     src="${src}"
     width="${ZOOM}%"
     onclick="viewpage(${next})"
    />
    `;
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  elem.scrollTo(0,0);
  elem.focus();
}

function to_image_url(path) {
  return encodeURI(`/image/${path}`);
}

function nav_to(index) {
  LOCATION.length = index + 1;  /* discard upper elements */
  document.getElementById("main").innerHTML = "";
  render_navbar();
}

function render_navbar() {
  var path = LOCATION.slice(-1)[0];
  if (path in FOLDERS) {
    render_navbar_resolved();
  } else {
    get_folder(path).then(render_navbar_resolved());
  }
}

function render_menubar_resolved() {
  var root = LOCATION.slice(-1)[0];
  var inner = "";
  for (index in LOCATION) {
    var loc = LOCATION[index];
    var title = "COMEX";
    if (loc !== "") {
      title = "&rarr; " + loc.split("/").slice(-1)[0];
    }
    inner += `<button class="btn path" onclick="nav_to(${index})">
      ${title}
    </button><!-- ${title} -->\n`;
  }
  inner += `
    &nbsp;
    <button class="btn zoom zoom_out"
            style="margin-left:auto" 
            onclick="zoom_out();">
    <span class="material-icons"> zoom_out </span>
    </button>
    <button class="btn" style="width: 5em">
    ${ZOOM}%
    </button>
    <button class="btn zoom zoom_in" onclick="zoom_in();">
    <span class="material-icons"> zoom_in </span>
    </button>
    <button class="btn fullscreen" onclick="openFullscreen();">
    <span class="material-icons"> settings_overscan </span>
    </button>
    `;
  document.getElementById("menubar").innerHTML = inner;
}

function render_navbar_resolved() {
  render_menubar_resolved();
  var root = LOCATION.slice(-1)[0];
  var inner = `<div class="navbar">\n  <div class="thumbnails">\n`;
  var pages = FOLDERS[root].pages;
  for (index in pages) {
    var page = pages[index];
    inner = inner.concat(pagenail(
      index,
      to_image_url(page),
      page));
  }

  var kids = FOLDERS[root].subfolders;
  for (kid_index in kids) {
    inner = inner.concat(dummy_thumbnail(kid_index));
  }
  inner += "</div></div>\n";
  document.getElementById("thumbs").innerHTML = inner;
  document.getElementById("main").focus();
  for (let kid_index in kids) {
    let kid = kids[kid_index];
    let path = [root, kid].join("/");
    if (root === "") {
      path = kid;
    }
    get_folder(path).then(function() {
      update_thumbnail_resolved(kid_index, path);
    });
  }
}

function render_image() {
}

function is_at_bottom() {
  var div = document.getElementById("main");
  return (div.offsetHeight + div.scrollTop + 1 >= div.scrollHeight);
}

function scroll_page() {
  var div = document.getElementById("main");
  div.scrollBy(0, div.clientHeight);
}

function help_on() {
  document.getElementById('overlay').style.display = "block";
}

function help_off() {
  document.getElementById('overlay').style.display = "none";
}

function zoom_out() {
  ZOOM = ZOOM * 8 / 10;
  render_navbar();
  refresh_page();
}

function zoom_in() {
  ZOOM *= 1.25;
  render_navbar();
  refresh_page();
}

var elem = document.documentElement;

/* View in fullscreen */
function openFullscreen() {
  var elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) { /* Safari */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) { /* IE11 */
    elem.msRequestFullscreen();
  } else {
    alert("Full screen not supported on this browser.");
  }
}

/* Close fullscreen */
function closeFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) { /* Safari */
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) { /* IE11 */
    document.msExitFullscreen();
  }
}


const KEYCODE_MINUS = 45;  /* zoom out */
const KEYCODE_EQUALS = 61;  /* zoom in */
const KEYCODE_SPACE = 32;  /* scroll */
const KEYCODE_N = 110;  /* next page */
const KEYCODE_P = 112;  /* previous page */
const KEYCODE_U = 117;  /* go up one folder level */
const KEYCODE_QUESTION = 63;

document.onkeypress = function(e) {
  if (e.which == KEYCODE_MINUS) {
    zoom_out();
  } else if (e.which == KEYCODE_EQUALS) {
    zoom_in();
  } else if (e.which == KEYCODE_SPACE) {
    e.preventDefault();  /* prevent default scrolling behavior. */
    if (is_at_bottom()) {
      set_current_page(CURRENT_PAGE + 1);
    } else {
      scroll_page();
    }
  } else if (e.which == KEYCODE_N) {
    set_current_page(CURRENT_PAGE + 1);
  } else if (e.which == KEYCODE_P) {
    set_current_page(CURRENT_PAGE - 1);
  } else if (e.which == KEYCODE_U) {
    if (LOCATION.length > 1) {
      nav_to(LOCATION.length - 2);
    }
  } else if (e.which == KEYCODE_QUESTION) {
    help_on();
  } else {
    console.log("unknown key: ", e.which);
  }
};

reload_folder_data();
