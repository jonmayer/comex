#![allow(dead_code)]
#![allow(unused_imports)]
#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use]
extern crate rocket;
#[macro_use]
extern crate rocket_contrib;

mod settings;

use rocket::fairing::AdHoc;
use rocket::http::RawStr;
use rocket::response::NamedFile;
use rocket::response::Redirect;
use rocket::State;
use rocket_contrib::json::Json;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, DirEntry};
use std::io;
use std::path::Path;
use std::path::PathBuf;
use std::sync::RwLock;

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

#[derive(Serialize, Clone)]
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
    fn new(path: &Path, image_root: &str, depth: usize) -> FolderMap {
        let mut fmap = FolderMap {
            map: HashMap::new(),
        };
        fmap.populate(path.to_string_lossy().to_string(), image_root, depth);
        return fmap;
    }

    fn get_submap(&self, path: &Path, depth: usize) -> FolderMap {
        let mut fmap = FolderMap {
            map: HashMap::new(),
        };
        fmap.recursive_copy_from(self, &path.to_string_lossy().to_string(), depth);
        return fmap;
    }

    fn recursive_copy_from(&mut self, other: &FolderMap, path: &str, depth: usize) {
        let other_folder = other.map.get(path);
        if other_folder.is_none() {
            return;
        }
        let other_folder = other_folder.unwrap();
        self.map.insert(path.to_owned(), other_folder.clone());
        if depth > 0 {
            for subdir in &other_folder.subfolders {
                let mut subpath: String = String::from(path);
                if path != "" {
                    subpath.push_str("/");
                }
                subpath.push_str(subdir);
                self.recursive_copy_from(other, &subpath, depth - 1);
            }
        }
    }

    fn populate(&mut self, path: String, image_root: &str, depth: usize) {
        let mut folder = Folder {
            path: path.to_owned(),
            title: "".to_owned(),
            cover: "".to_owned(),
            pages: Vec::new(),
            subfolders: Vec::new(),
        };
        let abs_path = Path::new(image_root).join(&path).canonicalize();
        if abs_path.is_err() {
            return;
        }
        let abs_path = abs_path.unwrap();
        // Don't escape image_root (rocket path should already enforce this).
        if !abs_path.starts_with(&image_root) {
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
                        self.populate(subpath.to_owned(), image_root, depth - 1);
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
// Configuration variables:
//

#[derive(Serialize, Deserialize, Debug)]
struct Config {
    static_root: String,
    image_root: String,
}

//
// Response Handlers
//

#[get("/")]
fn hello() -> Redirect {
    Redirect::to("/index.html")
}

#[get("/<path>")]
async fn static_content(path: String, config: State<'_, Config>) -> Option<NamedFile> {
    NamedFile::open(Path::new(&config.static_root).join(path))
        .await
        .ok()
}

#[get("/image/<path..>")]
async fn image(path: PathBuf, config: State<'_, Config>) -> Option<NamedFile> {
    NamedFile::open(Path::new(&config.image_root).join(path))
        .await
        .ok()
}

fn update_folder_map(fmap_lock: RwLock<FolderMap>, config: &Config) {
    let new_fmap = FolderMap::new(Path::new(""), &config.image_root, 9);
    {
        let mut fmap_ptr = fmap_lock.write().unwrap();
        *fmap_ptr = new_fmap;
    }
}

// for example: http://localhost:8000/folder/Appleseed?depth=2
#[get("/folder/<path..>?<depth>")]
fn folder(path: PathBuf, depth: usize, fmap_lock: State<'_, RwLock<FolderMap>>) -> Json<FolderMap> {
    // since <path..> can't be empty, we remove any ROOT segment we find.
    let fixed_path = path.strip_prefix("/").unwrap_or(&path);
    let fixed_path = fixed_path.strip_prefix("ROOT").unwrap_or(fixed_path);

    let submap: FolderMap;
    {
        let fmap_ptr = fmap_lock.read().unwrap();
        submap = fmap_ptr.get_submap(fixed_path, depth);
    }

    return Json(submap);
}

#[launch]
fn rocket() -> rocket::Rocket {
    let mut rocket = rocket::ignite()
        .mount("/", routes![hello, image, static_content, folder])
        .attach(AdHoc::config::<Config>());

    let figment = rocket.figment();
    let config: Config = figment.extract().expect("config");
    let mut fmap: FolderMap = FolderMap::new(Path::new(""), &config.image_root, 9);
    rocket = rocket.manage(RwLock::new(fmap));
    rocket
}
