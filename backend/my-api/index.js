const express = require('express')
const app = express()

app.use(express.json())

app.get('/hello', (req, res) => {
  res.json({ message: 'Hello World!' })
})

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000')
})
