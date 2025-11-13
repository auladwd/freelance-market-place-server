// Basic Setup

const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
require('dotenv').config();
const serviceAccount = require('./serviceKey.json');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Firebase Admin Initialization

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@project-server.qxfj2tl.mongodb.net/?appName=project-server`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(401)
      .send({ message: 'Unauthorized access. Token not found!' });
  }

  const token = authorization.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);

    req.decodedEmail = decoded.email;
    req.decodedToken = decoded;
    next();
  } catch (error) {
    res.status(401).send({ message: 'Unauthorized access.' });
  }
};

async function run() {
  try {
    // await client.connect();
    const db = client.db('marketplace_db');
    const jobCollection = db.collection('job_listings');

    app.get('/jobs', async (req, res) => {
      const result = await jobCollection.find().toArray();
      res.send(result);
    });

    app.get('/jobs/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      const objectId = new ObjectId(id);
      const result = await jobCollection.findOne({ _id: objectId });
      res.send({ success: true, result });
    });

    app.post('/jobs', verifyToken, async (req, res) => {
      const data = req.body || {};
      // Prefer server-verified email over whatever client sent
      if (req.decodedEmail) data.postedBy = req.decodedEmail;
      // Add creation timestamp if not provided
      if (!data.created_at) data.created_at = new Date();
      const result = await jobCollection.insertOne(data);
      res.send({ success: true, result });
    });

    app.put('/jobs/:id', async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      const objectId = new ObjectId(id);
      const filter = { _id: objectId };
      const update = { $set: data };
      const result = await jobCollection.updateOne(filter, update);
      res.send({ success: true, result });
    });

    app.delete('/jobs/:id', async (req, res) => {
      const { id } = req.params;
      const result = await jobCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({ success: true, result });
    });

    app.get('/latest-jobs', async (req, res) => {
      const result = await jobCollection
        .find()
        .sort({ created_at: -1 }) // Sort by descending creation date
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get('/my-jobs', verifyToken, async (req, res) => {
      const email = req.decodedEmail || req.query.email;
      if (!email) return res.status(400).send({ message: 'Email is required' });
      const result = await jobCollection.find({ postedBy: email }).toArray();
      res.send(result);
    });

    app.get('/search', async (req, res) => {
      const searchText = req.query.search;
      const result = await jobCollection
        .find({ title: { $regex: searchText, $options: 'i' } })
        .toArray();
      res.send(result);
    });

    app.put('/jobs/accept/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      const objectId = new ObjectId(id);
      const filter = { _id: objectId };
      const update = {
        $set: {
          status: 'accepted',
          acceptedBy: req.decodedEmail || null,
          accepted_at: new Date(),
        },
      };
      const result = await jobCollection.updateOne(filter, update);
      res.send({ success: true, result });
    });

    console.log('Connected to MongoDB and server is running.');
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Server is running fine!');
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
