// server.js
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS books (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        author VARCHAR(300) NOT NULL,
        year INTEGER,
        genre VARCHAR(100),
        pages INTEGER,
        price DECIMAL(10,2),
        isbn VARCHAR(20),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// Routes

// Get all books
app.get('/api/books', async (req, res) => {
  try {
    const { search, genre } = req.query;
    let query = 'SELECT * FROM books';
    let params = [];
    let conditions = [];

    if (search) {
      conditions.push(`(title ILIKE $${params.length + 1} OR author ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (genre) {
      conditions.push(`genre = $${params.length + 1}`);
      params.push(genre);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching books:', err);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

// Get single book
app.get('/api/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM books WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching book:', err);
    res.status(500).json({ error: 'Failed to fetch book' });
  }
});

// Add new book
app.post('/api/books', async (req, res) => {
  try {
    const { title, author, year, genre, pages, price, isbn, description } = req.body;
    
    if (!title || !author) {
      return res.status(400).json({ error: 'Title and author are required' });
    }

    const result = await pool.query(
      `INSERT INTO books (title, author, year, genre, pages, price, isbn, description) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, author, year || null, genre || null, pages || null, price || null, isbn || null, description || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding book:', err);
    res.status(500).json({ error: 'Failed to add book' });
  }
});

// Update book
app.put('/api/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, author, year, genre, pages, price, isbn, description } = req.body;
    
    if (!title || !author) {
      return res.status(400).json({ error: 'Title and author are required' });
    }

    const result = await pool.query(
      `UPDATE books 
       SET title = $1, author = $2, year = $3, genre = $4, pages = $5, 
           price = $6, isbn = $7, description = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [title, author, year || null, genre || null, pages || null, price || null, isbn || null, description || null, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating book:', err);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

// Delete book
app.delete('/api/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM books WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    res.json({ message: 'Book deleted successfully' });
  } catch (err) {
    console.error('Error deleting book:', err);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const totalBooksResult = await pool.query('SELECT COUNT(*) as count FROM books');
    const authorsResult = await pool.query('SELECT COUNT(DISTINCT LOWER(author)) as count FROM books');
    const genresResult = await pool.query('SELECT COUNT(DISTINCT genre) as count FROM books WHERE genre IS NOT NULL AND genre != \'\'');
    const totalValueResult = await pool.query('SELECT SUM(price) as total FROM books WHERE price IS NOT NULL');

    res.json({
      totalBooks: parseInt(totalBooksResult.rows[0].count),
      uniqueAuthors: parseInt(authorsResult.rows[0].count),
      uniqueGenres: parseInt(genresResult.rows[0].count),
      totalValue: parseFloat(totalValueResult.rows[0].total || 0)
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get unique genres for filter
app.get('/api/genres', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT genre FROM books WHERE genre IS NOT NULL AND genre != \'\' ORDER BY genre'
    );
    res.json(result.rows.map(row => row.genre));
  } catch (err) {
    console.error('Error fetching genres:', err);
    res.status(500).json({ error: 'Failed to fetch genres' });
  }
});

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database and start server
initDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
});

module.exports = app;