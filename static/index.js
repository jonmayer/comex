// LOCATION is a stack of directories being viewed.
var LOCATION = [""];
// FOLDERS is a JSON map of information about folders.
var FOLDERS = {};
// IMAGES is a cache of images that we might display to the user.
var IMAGES = [];
var ZOOM=100;
var CURRENT_PAGE=0;

const THUMBWIDTH="220px";

function reload_folder_data() {
  // Let's use the new Fetch API to grab our json data.
  fetch('/folder/ROOT/?depth=9')
    .then(
      function(response) {
        if (response.status !== 200) {
          console.log('Looks like there was a problem. Status Code: ' +
            response.status);
          return;
        }

        console.log(response.headers.get('Content-Type'));
        console.log(response.headers.get('Date'));
        console.log(response.status);
        console.log(response.statusText);
        console.log(response.type);
        console.log(response.url);

        // Examine the text in the response
        response.json().then(function(data) {
          FOLDERS = data["map"];
          console.log(FOLDERS);
          render();
        });
      }
    )
    .catch(function(err) {
      console.log('Fetch Error :-S', err);
    });
}

function render() {
  render_navbar();
  render_image();
}

// thumbnail for subfolders:
function thumbnail(src, title, path) {
  return `
    <figure
   onclick="change_dir('${path}')"
   onmouseover="view('${src}')"
    >
    <img loading=lazy
   src="${src}"
   alt="${title}"
   width="${THUMBWIDTH}"
    />
    <figurecaption>${title}</figurecaption>
    </figure>
    `;
}

// thumbnail for pages:
function pagenail(index, src, title) {
  return `
    <figure
   onclick="viewpage(${index})"
    >
    <img loading=lazy
   src="${src}"
   alt="${title}"
   width="${THUMBWIDTH}"
   id="pagenail_${index}"
    />
    </figure>
    `;
}

function change_dir(path) {
  LOCATION.push(path);
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
  CURRENT_PAGE = index;
  refresh_page();
}

function viewpage(index) {
  var path = LOCATION.slice(-1)[0];
  var metadata = FOLDERS[path];
  if (index >= metadata.pages.length) {
    index = metadata.pages.length - 1;
  }
  if (index < 0) { index = 0; }
  set_current_page(index);
}

function refresh_page() {
  // TODO: handle no pages condition.
  var path = LOCATION.slice(-1)[0];
  var metadata = FOLDERS[path];
  var src = to_image_url(metadata.pages[CURRENT_PAGE]);
  var next = CURRENT_PAGE + 1;
  var prev = CURRENT_PAGE - 1;
  document.getElementById('main').innerHTML = `
    <img loading=lazy
   src="${src}"
   width="${ZOOM}%"
   onclick="viewpage(${next})"
    />
    `;
  document.getElementById("main").focus();
}

function to_image_url(path) {
  return `/image/${path}`;
}

function nav_to(index) {
  LOCATION.length = index + 1;  /* discard upper elements */
  document.getElementById("main").innerHTML = "";
  render_navbar();
}

function render_navbar() {
  var root = LOCATION.slice(-1)[0];
  var inner = `<div class="navbar">\n`;
  for (index in LOCATION) {
    var loc = LOCATION[index];
    var title = "COMEX";
    if (loc !== "") {
      title = "&rarr; " + loc.split("/").slice(-1)[0];
    }
    inner += `<div class="path" onclick="nav_to(${index})">
      <span style="font-family: Quicksand, sans-serif">${title}</span>
        </div>\n`;
  }
  var pages = FOLDERS[root].pages;
  for (index in pages) {
    var page = pages[index];
    inner = inner.concat(pagenail(
      index,
      to_image_url(page),
      page));
  }

  var kids = FOLDERS[root].subfolders;
  for (kid of kids) {
    var path = [root, kid].join("/");
    if (root === "") {
      path = kid;
    }
    kid_metadata = FOLDERS[path];
    inner = inner.concat(thumbnail(
      to_image_url(kid_metadata.cover),
      kid_metadata.title,
      path));
  }
  inner = inner.concat("</div>\n");
  document.getElementById("header").innerHTML = inner;
  document.getElementById("main").focus();
}

function render_image() {
}

const KEYCODE_MINUS = 45;  /* zoom out */
const KEYCODE_EQUALS = 61;  /* zoom in */
const KEYCODE_SPACE = 32;  /* scroll */
const KEYCODE_N = 110;  /* next page */
const KEYCODE_P = 112;  /* previous page */

function is_at_bottom() {
  var div = document.getElementById("main");
  return (div.offsetHeight + div.scrollTop + 1 >= div.scrollHeight);
}

function scroll_page() {
  var div = document.getElementById("main");
  div.scrollBy(0, div.clientHeight);
}

document.onkeypress = function(e) {
  if (e.which == KEYCODE_MINUS) {
    ZOOM = ZOOM * 8 / 10;
    console.log(ZOOM);
    refresh_page();
  } else if (e.which == KEYCODE_EQUALS) {
    ZOOM *= 1.25;
    console.log(ZOOM);
    refresh_page();
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
  } else {
    console.log("unknown key: ", e.which);
  }
};

reload_folder_data();
