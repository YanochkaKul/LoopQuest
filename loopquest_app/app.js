const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt'); // Required for password hashing
const app = express();
saltRounds = 10;

// Database Connection Setup
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '331501', // MySQL password
    database: 'loopquest_db'
});

db.connect((err) => {
    if (err) {
        console.log("ERROR: Database connection failed!");
        console.log("Make sure MySQL is running in XAMPP and 'loopquest_db' exists.");
    } else {
        console.log('Success: Connected to MySQL (loopquest_db)!');
    }
});

// View Engine & Static Files
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'loopquest_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Routes
app.get('/', (req, res) => {
    res.render('login');
});

// Route: Handle Login & Auto-Registration (Stage 2 Logic)
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Check if user already exists in the database
    const findUserQuery = 'SELECT * FROM users WHERE username = ?';
    
    db.execute(findUserQuery, [username], async (err, results) => {
        if (err) return res.status(500).send("Database Error");

        if (results.length > 0) {
            // RETURNING PLAYER: Compare hashed password
            const match = await bcrypt.compare(password, results[0].password);
            if (match) {
                // Successful Login: Create Session
                req.session.userId = results[0].user_id;
                req.session.username = results[0].username;
                return res.redirect('/rules'); // Next stage: Game Menu
            } else {
                return res.send("This username is already occuped but your password is incorrect. Please try again: eather input correct password or choose another username .");
            }
        } else {
            // NEW PLAYER: Automatic Registration
            try {
                const hashedPassword = await bcrypt.hash(password, saltRounds);
                const createUserQuery = 'INSERT INTO users (username, password) VALUES (?, ?)';
                
                db.execute(createUserQuery, [username, hashedPassword], (err, insertResult) => {
                    if (err) return res.status(500).send("Error creating user profile");
                    
                    // Successful Registration: Create Session
                    req.session.userId = insertResult.insertId;
                    req.session.username = username;
                    res.redirect('/rules');
                });
            } catch (hashError) {
                res.status(500).send("Security Hashing Error");
            }
        }
    });
});


// Route: Rules Page (Stage 3)
app.get('/rules', (req, res) => {
    // Safety check: if no session, redirect back to login
    if (!req.session.userId) {
        return res.redirect('/');
    }
    
    // Render the rules.pug file and pass the username
    res.render('rules', { 
        username: req.session.username 
    });
});

// Route: Display a specific question by ID (Stage 5)
app.get('/game/question/:id', (req, res) => {
    if (!req.session.userId) return res.redirect('/');

    const questionId = req.params.id;
    const userId = req.session.userId;

    // First, always fetch the question data so we have it for the page
    const query = 'SELECT * FROM questions WHERE question_id = ?';
    db.execute(query, [questionId], (err, results) => {
        if (err || results.length === 0) return res.send("Question not found.");
        
        const question = results[0];

        // Now check if the user already answered it
        const checkAttempt = 'SELECT * FROM attempts WHERE user_id = ? AND question_id = ?';
        db.execute(checkAttempt, [userId, questionId], (err, attempts) => {
            if (attempts.length > 0) {
                // Now we pass BOTH alreadyAnswered AND the question object
                return res.render('question', { 
                    alreadyAnswered: true,
                    question: question, 
                    username: req.session.username
                });
            }

            // Normal flow: question not answered yet
            res.render('question', { 
                question: question,
                username: req.session.username 
            });
        });
    });
});
// Route: Submit Answer & Show Feedback
app.post('/submit-answer', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }

    const { question_id, user_answer } = req.body;
    const userId = req.session.userId;

    const query ='SELECT * FROM questions WHERE question_id = ?';

    db.execute(query, [question_id], (err, results) => {

        if (err || results.length === 0) {
            return res.send("Question not found.");
        }
        const question = results[0];

        // Sanitize and compare answers (using UpperCase to avoid case mismatch)
        const playerAnswer = (user_answer || "").toString().trim().toLowerCase();
        const correctAnswer = (question.correct_answer || "").toString().trim().toLowerCase();
        const isCorrect = playerAnswer === correctAnswer;

        // Save attempt to database
        const insertQuery = `INSERT INTO attempts (user_id, question_id, user_answer, is_correct) VALUES (?, ?, ?, ?)`;

        db.execute(insertQuery, [userId, question_id, playerAnswer, isCorrect ? 1 : 0], (err) => {
            if (err) {
                console.error("DB Error:", err);
                return res.send("Database error.");
            }

            // Calculate stats for the feedback page
            const statsQuery = 'SELECT COUNT(*) as total, SUM(is_correct) as correct FROM attempts WHERE user_id = ?';
            db.execute(statsQuery, [userId], (err, statsResults) => {
                if (err) return res.send("Error calculating stats.");

                const total = statsResults[0].total || 0;
                const correct = statsResults[0].correct || 0;
                const score = total > 0 ? Math.round((correct / total) * 100) : 0;

                // Render the feedback page instead of question page
                res.render('feedback', {
                    isCorrect: isCorrect,
                    questionText: question.question_text,
                    userAnswer: playerAnswer,
                    correctAnswer: question.correct_answer,
                    total: total,
                    correct: correct,
                    score: score
                });
            });    
        });

    });

});
// Route: Leaderboard (Final QR Code)
app.get('/leaderboard', (req, res) => {
    if (!req.session.userId) return res.redirect('/');

    // Calculate score percentage for each player based on their attempts
    const query = `
        SELECT u.username, 
               ROUND((SUM(a.is_correct) / COUNT(a.attempt_id)) * 100) as score
        FROM users u
        JOIN attempts a ON u.user_id = a.user_id
        GROUP BY u.user_id
        ORDER BY score DESC
        LIMIT 10`;

    db.execute(query, (err, players) => {
        if (err) {
            console.error("Leaderboard Error:", err);
            return res.send("Database Error while fetching leaderboard.");
        }
        res.render('leaderboard', { players: players });
    });
});
// Route: Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Server Start
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running at: http://localhost:${PORT}`);
    console.log(`Ready for Ngrok! Use: ngrok http ${PORT}`);
});



