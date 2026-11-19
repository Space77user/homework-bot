const Database = require("better-sqlite3")
const db = new Database("domashka.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_of_week INTEGER NOT NULL,
        subject TEXT NOT NULL
    );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS homeworks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id INTEGER NOT NULL, 
        author_id INTEGER,
        author_name TEXT,
        text TEXT,
        photo_id TEXT,
        week_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lesson_id) REFERENCES lessons(id)
    );
`);

function addLesson(day, subject) {
        const stmt = db.prepare("INSERT INTO lessons (day_of_week, subject) VALUES (?,?)");
        return stmt.run(day, subject);
};

function getLessonsByDay(day){
    return db.prepare("SELECT * FROM lessons WHERE day_of_week = ? ORDER BY id ASC").all(day);
}
function addHomework(lessonId, authorId, authorName, text, photoId, weekId) {
    return db.prepare("INSERT INTO homeworks (lesson_id, author_id, author_name, text, photo_id, week_id) VALUES (?,?,?,?,?,?)").run(
        lessonId, authorId, authorName, text, photoId, weekId
    );
};

function getHomeworksByLesson(lessonId, weekId) {
    return db.prepare("SELECT * FROM homeworks WHERE lesson_id = ? AND week_id = ? ORDER BY id ASC").all(lessonId, weekId);
}

function clearOldHomeworks(currentWeekId) {
    return db.prepare("DELETE FROM homeworks WHERE week_id !=?").run(currentWeekId);
};
function deleteHomework(homeworkId) {
    return db.prepare("DELETE FROM homeworks WHERE id = ?").run(homeworkId);
}
function deleteLesson(lessonId) {
    return db.prepare("DELETE FROM lessons WHERE id = ?").run(lessonId);
}

module.exports ={ addLesson,getLessonsByDay, addHomework,getHomeworksByLesson, clearOldHomeworks,deleteHomework,deleteLesson, }