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
    password: '331501', // Your XAMPP/MySQL password
    database: 'loopquest_db'
});

db.connect((err) => {
    if (err) {
        console.log("-----------------------------------------");
        console.log("ERROR: Database connection failed!");
        console.log("Make sure MySQL is running in XAMPP and 'loopquest_db' exists.");
        console.log("-----------------------------------------");
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

// Server Start
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running at: http://localhost:${PORT}`);
    console.log(`Ready for Ngrok! Use: ngrok http ${PORT}`);
});



