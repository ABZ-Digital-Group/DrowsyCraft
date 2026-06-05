const express = require('express');
const path = require('path');
const app = express();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;

// --- VIEW ENGINE ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- STATIC ASSETS ---
app.use(express.static(path.join(__dirname, 'public')));



// --- ROUTES ---
app.get('/', (req, res) => {
    res.render('pages/index'); 
});

app.get('/rules', (req, res) => {
    res.render('pages/rules'); 
});

app.listen(PORT, () => console.log(`🚀 DrowsyCraft running on port ${PORT}`));