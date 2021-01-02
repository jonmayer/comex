#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;
#[macro_use]
extern crate rocket_contrib;

use rocket::http::RawStr;
use rocket::response::NamedFile;
use rocket_contrib::json::Json;
use serde::Serialize;
use std::collections::HashMap;
use std::fs::{self, DirEntry};
use std::io;
use std::path::Path;
use std::path::PathBuf;

const ROOTDIR: &'static str = "/mnt/bigbox/images/comics/";

fn path_to_title(s: &str) -> String {
    let mut s = s.replace("/", ": ").replace("_", " ");
    let indices: Vec<usize> = s.match_indices(" ").map(|(i, _)| i).collect();
    for index in indices {
        if let Some(r) = s.get_mut(index + 1..index + 2) {
            r.make_ascii_uppercase();
        }
    }
    if s.len() > 40 {
        let mut t = "..".to_string();
        t.push_str(&s[s.len() - 40..]);
        s = t;
    }
    return s;
}

#[derive(Serialize)]
struct Folder {
    path: String,
    title: String,
    cover: String,
    pages: Vec<String>,
    subfolders: Vec<String>,
}

#[derive(Serialize)]
struct FolderMap {
    map: HashMap<String, Folder>,
}

impl FolderMap {
    fn new(path: &Path, depth: usize) -> FolderMap {
        let mut fmap = FolderMap {
            map: HashMap::new(),
        };
        fmap.populate(path.to_string_lossy().to_string(), depth);
        return fmap;
    }

    fn populate(&mut self, path: String, depth: usize) {
        let mut folder = Folder {
            path: path.to_owned(),
            title: "".to_owned(),
            cover: "".to_owned(),
            pages: Vec::new(),
            subfolders: Vec::new(),
        };
        let abs_path = Path::new(ROOTDIR).join(&path).canonicalize();
        if abs_path.is_err() {
            return;
        }
        let abs_path = abs_path.unwrap();
        // Don't escape ROOTDIR:
        if !abs_path.starts_with(ROOTDIR) {
            return;
        }
        if !abs_path.is_dir() {
            return;
        }

        // iterate through directory entries:
        let entries = fs::read_dir(abs_path);
        if entries.is_err() {
            return;
        }
        let entries = entries.unwrap();
        for entry in entries {
            if let Ok(entry) = entry {
                if entry.file_name().to_str().unwrap().starts_with(".") {
                    continue;
                }
                let mut subpath = path.clone();
                if subpath != "" {
                    subpath.push_str("/");
                }
                subpath.push_str(entry.file_name().to_str().unwrap());

                let entry_path = entry.path();
                if entry_path.is_dir() {
                    folder
                        .subfolders
                        .push(entry.file_name().to_str().unwrap().to_owned());
                    if depth > 0 {
                        self.populate(subpath.to_owned(), depth - 1);
                    }
                }
                if entry_path.is_file() {
                    if entry
                        .file_name()
                        .into_string()
                        .unwrap()
                        .starts_with("cover.")
                    {
                        folder.cover = subpath.to_owned();
                        continue;
                    }
                    let ext = entry_path.extension();
                    if ext.is_none() {
                        continue;
                    };
                    let ext = ext.unwrap().to_str().unwrap();
                    if !matches!(ext, "jpg" | "png" | "gif" | "jpeg") {
                        continue;
                    }
                    folder.pages.push(subpath.to_owned());
                }
            }
        }
        folder.pages.sort();
        folder.subfolders.sort();
        if folder.cover == "" && (folder.pages.len() > 0) {
            folder.cover = folder.pages[0].clone();
        }
        if folder.title == "" {
            folder.title = path_to_title(&folder.path);
        }

        self.map.insert(path, folder);
    }
} // impl FolderMap

//
// Response Handlers
//

#[get("/")]
fn hello() -> &'static str {
    "Hello, world!"
}

#[get("/image/<path..>")]
async fn image(path: PathBuf) -> Option<NamedFile> {
    NamedFile::open(Path::new(ROOTDIR).join(path)).await.ok()
}

// for example: http://localhost:8000/folder/Appleseed?depth=2
#[get("/folder/<path..>?<depth>")]
fn folder(path: PathBuf, depth: usize) -> Json<FolderMap> {
    // since <path..> can't be empty, we remove any ROOT segment we find.
    let fixed_path = path.strip_prefix("/").unwrap_or(&path);
    let fixed_path = fixed_path.strip_prefix("ROOT").unwrap_or(fixed_path);
    let fmap = FolderMap::new(fixed_path, depth);
    return Json(fmap);
}

#[launch]
fn rocket() -> rocket::Rocket {
    rocket::ignite().mount("/", routes![hello, image, folder])
}
