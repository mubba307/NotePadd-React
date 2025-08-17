import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const STORAGE_KEY = "advanced_notepad_v1";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function App() {
  const [notes, setNotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });

  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [titleInput, setTitleInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + "_theme");
    return saved ? JSON.parse(saved) : true;
  });
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const editorRef = useRef(null);
  const autosaveTimer = useRef(null);

  // Get all unique tags sorted alphabetically
  const allTags = useMemo(() => {
    const tagsSet = new Set();
    notes.forEach((note) => {
      (note.tags || []).forEach((tag) => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }, [notes]);

  // Autosave notes to localStorage (debounced)
  useEffect(() => {
    setSaving(true);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    autosaveTimer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      setSaving(false);
    }, 800);

    return () => clearTimeout(autosaveTimer.current);
  }, [notes]);

  // Persist theme selection
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + "_theme", JSON.stringify(isDark));
  }, [isDark]);

  // Create new note and open it for editing
  const createNote = () => {
    const newNote = {
      id: uid(),
      title: "Untitled",
      content: "<div><p></p></div>",
      tags: [],
      pinned: false,
      updatedAt: Date.now(),
    };
    setNotes((prev) => [newNote, ...prev]);
    startEdit(newNote.id);
  };

  // Start editing existing note
  const startEdit = (id) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;

    setEditingId(id);
    setTitleInput(note.title);
    setTagInput((note.tags || []).join(", "));
    setPreviewMode(false);

    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = note.content || "";
        placeCursorToEnd(editorRef.current);
      }
    }, 0);
  };

  // Save edits made to note
  const saveEdit = () => {
    if (!editingId) return;

    const content = editorRef.current?.innerHTML || "";
    setNotes((prev) =>
      prev.map((note) =>
        note.id === editingId
          ? {
              ...note,
              title: titleInput.trim() || "Untitled",
              tags: tagInput
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
              content,
              updatedAt: Date.now(),
            }
          : note
      )
    );
    clearEditing();
  };

  // Cancel editing
  const cancelEdit = () => clearEditing();

  const clearEditing = () => {
    setEditingId(null);
    setTitleInput("");
    setTagInput("");
    setPreviewMode(false);
  };

  // Delete note with confirmation
  const deleteNote = (id) => {
    if (!window.confirm("Delete this note?")) return;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (editingId === id) clearEditing();
  };

  // Toggle pinned state of note
  const togglePin = (id) => {
    setNotes((prev) =>
      prev.map((note) =>
        note.id === id ? { ...note, pinned: !note.pinned } : note
      )
    );
  };

  // Duplicate note
  const duplicateNote = (id) => {
    const baseNote = notes.find((n) => n.id === id);
    if (!baseNote) return;

    const copy = {
      ...baseNote,
      id: uid(),
      title: baseNote.title + " (copy)",
      updatedAt: Date.now(),
    };
    setNotes((prev) => [copy, ...prev]);
  };

  // Apply formatting commands to editor
  const format = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  // Filter and sort notes for display
  const filteredNotes = useMemo(() => {
    return notes
      .filter((note) => {
        const text = (note.title + " " + stripHtml(note.content)).toLowerCase();
        return query ? text.includes(query.toLowerCase()) : true;
      })
      .filter((note) => (tagFilter ? (note.tags || []).includes(tagFilter) : true))
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, query, tagFilter]);

  // Keyboard shortcuts for save and cancel
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (editingId) saveEdit();
      }
      if (e.key === "Escape") {
        if (editingId) cancelEdit();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [editingId, titleInput, tagInput]);

  // Export notes as JSON file
  const exportNotes = () => {
    const dataStr = JSON.stringify(notes, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "notes_backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import notes from JSON file
  const importNotes = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (Array.isArray(imported)) {
          setNotes(imported);
          alert("Notes imported!");
        } else {
          alert("Invalid file format");
        }
      } catch {
        alert("Failed to parse JSON");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className={isDark ? "root dark" : "root"}>
      <header className="top">
        <div className="left">
          <h1>Notepad</h1>
          <div className="controls">
            <input
              aria-label="Search notes"
              className="search"
              placeholder="Search notes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="tag-filter"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            >
              <option value="">All tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="right">
          <button className="iconBtn" title="New note" onClick={createNote}>
            ➕ New
          </button>
          <button
            className="iconBtn"
            onClick={() => setIsDark((d) => !d)}
            title="Toggle theme"
          >
            {isDark ? "🌙" : "☀️"}
          </button>
          <button className="iconBtn" title="Export notes" onClick={exportNotes}>
            📤 Export
          </button>
          <label
            className="iconBtn"
            title="Import notes"
            style={{ cursor: "pointer" }}
          >
            📥 Import
            <input
              type="file"
              accept="application/json"
              onChange={importNotes}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </header>

      <main className="main">
        {/* Notes List */}
        <section className="notesColumn">
          {filteredNotes.length === 0 && <div className="empty">No notes yet.</div>}

          {filteredNotes.map((note) => (
            <article className="noteCard" key={note.id}>
              <div className="noteHeader">
                <div>
                  <h3 className="noteTitle">{note.title}</h3>
                  <div className="meta">
                    <small>{new Date(note.updatedAt).toLocaleString()}</small>
                    <div className="tags">
                      {(note.tags || []).slice(0, 3).map((t) => (
                        <span className="tag" key={t}>
                          #{t}
                        </span>
                      ))}
                      {(note.tags || []).length > 3 && (
                        <span className="tag more">
                          +{note.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="noteActions">
                  <button onClick={() => togglePin(note.id)} title="Pin/Unpin">
                    {note.pinned ? "📌" : "📍"}
                  </button>
                  <button onClick={() => startEdit(note.id)} title="Edit">
                    ✏️
                  </button>
                  <button onClick={() => duplicateNote(note.id)} title="Duplicate">
                    ⎘
                  </button>
                  <button onClick={() => deleteNote(note.id)} title="Delete">
                    🗑
                  </button>
                </div>
              </div>

              <div
                className="notePreview"
                dangerouslySetInnerHTML={{ __html: note.content }}
              />
            </article>
          ))}
        </section>

        {/* Editor Section */}
        <section className="editorColumn">
          {editingId ? (
            <div className="editorCard">
              <div className="editorHeader">
                <input
                  className="titleInput"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="Note title..."
                />
                <input
                  className="tagInput"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="tags (comma separated)"
                />
              </div>

              <div className="toolbar">
                <button onClick={() => format("bold")} title="Bold">
                  B
                </button>
                <button onClick={() => format("italic")} title="Italic">
                  I
                </button>
                <button onClick={() => format("underline")} title="Underline">
                  U
                </button>
                <button onClick={() => format("formatBlock", "H2")} title="H2">
                  H2
                </button>
                <button
                  onClick={() => format("insertUnorderedList")}
                  title="UL"
                >
                  • List
                </button>
                <button
                  onClick={() => {
                    const url = prompt("Insert link URL");
                    if (url) format("createLink", url);
                  }}
                  title="Link"
                >
                  🔗
                </button>
                <button onClick={() => format("removeFormat")} title="Clear format">
                  ✖
                </button>

                <button
                  onClick={() => setPreviewMode((v) => !v)}
                  title="Toggle Preview Mode"
                  style={{ marginLeft: "auto" }}
                >
                  {previewMode ? "✍️ Edit" : "👁 Preview"}
                </button>
              </div>

              {previewMode ? (
                <div
                  className="editor"
                  style={{
                    whiteSpace: "pre-wrap",
                    minHeight: 220,
                    padding: 10,
                    backgroundColor: isDark ? "#0d1426" : "#eee",
                    color: isDark ? "#eee" : "#222",
                    borderRadius: 8,
                    overflowY: "auto",
                  }}
                  dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || "" }}
                />
              ) : (
                <div
                  ref={editorRef}
                  className="editor"
                  contentEditable
                  suppressContentEditableWarning
                  style={{ minHeight: 220 }}
                />
              )}

              <div className="editorFooter">
                <div className="charCount">
                  {editorRef.current ? stripHtml(editorRef.current.innerHTML).length : 0}{" "}
                  chars {saving && <em style={{ marginLeft: 10, fontSize: 12 }}>Saving...</em>}
                </div>
                <div className="editorBtns">
                  <button className="save" onClick={saveEdit}>
                    💾 Save (Ctrl/Cmd+S)
                  </button>
                  <button className="cancel" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="helpCard">
              <h3>Welcome</h3>
              <p>
                Select a note to edit or press <strong>New</strong> to create one.
              </p>
              <p>Use the toolbar to format text. Ctrl/Cmd+S saves the note.</p>
              <p>Notes are saved locally in your browser.</p>
              <p>Use the preview button to toggle Markdown preview mode.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// Helper: strip HTML tags
function stripHtml(html = "") {
  return html.replace(/<[^>]*>?/gm, "");
}

// Helper: place cursor at the end of editable content
function placeCursorToEnd(el) {
  if (!el) return;
  try {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // ignore errors silently
  }
}
