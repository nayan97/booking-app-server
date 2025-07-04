const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Stripe = require("stripe");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const stripe = Stripe(process.env.PAYMENT_STRIPE_KEY);
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2ossgvg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const parcelsCollection = client.db("fastMover").collection("parcels");
    const paymentsCollection = client.db("fastMover").collection("payments");
    

    //stripe apis
    app.post('/api/create-payment-intent', async (req, res) => {
      const amounts = req.body.amount
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amounts, // amount in cents
      currency: 'usd',
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//payments apis
app.post("/api/payment-success", async (req, res) => {
  const { parcelId, amount, user, transactionId, paymentMethod } = req.body;

  if (!parcelId || !user || !amount) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // 1️⃣ Update parcel paymentStatus to "paid"
    const updateResult = await parcelsCollection.updateOne(
      { _id: new ObjectId(parcelId) },
      { $set: { paymentStatus: "paid" } }
    );

    // 2️⃣ Insert into payment history
    const payment = {
      parcelId: new ObjectId(parcelId),
      user, // { uid, name, email }
      amount,
      transactionId,
      paymentMethod, // Optional
      createdAt: new Date().toISOString(),
    };

    await paymentsCollection.insertOne(payment);

    res.status(200).json({ message: "Payment recorded and parcel updated." });
  } catch (error) {
    console.error("Payment success handling error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// payment History

app.get("/api/payments", async (req, res) => {
  const { email } = req.query;

  try {
    const filter = email ? { "user.email": email } : {};
    const payments = await paymentsCollection
      .find(filter)
      .sort({ createdAt: -1 }) // Descending
      .toArray();

    res.status(200).json(payments);
  } catch (error) {
    res.status(500).json({ message: "Failed to load payment history" });
  }
});



    // parcels apis

    app.get("/api/parcels", async (req, res) => {
      try {
        // Optional: If user is authenticated, extract userId
        const userEmail = req.query.userEmail; // OR use req.user.id if using auth middleware

        const filter = userEmail ? { "user.email": userEmail } : {};

        const parcels = await parcelsCollection
          .find(filter)
          .sort({ createdAt: -1 }) // Latest first
          .toArray();

        res.status(200).json(parcels);
      } catch (error) {
        console.error("Error fetching parcels:", error);
        res.status(500).json({ message: "Failed to fetch parcels" });
      }
    });

    // get parcel by id

app.get("/api/parcels/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid parcel ID" });
  }

  try {
    const parcel = await parcelsCollection.findOne({ _id: new ObjectId(id) });

    if (!parcel) {
      return res.status(404).json({ message: "Parcel not found" });
    }

    res.status(200).json(parcel);
  } catch (error) {
    console.error("Error fetching parcel:", error);
    res.status(500).json({ message: "Failed to fetch parcel" });
  }
});

    // parcels post api
    app.post("/api/parcels", async (req, res) => {
      const data = req.body;

      // ✅ Validate required fields here

      try {
        // 💾 Save to MongoDB
        const result = await parcelsCollection.insertOne(data);

        res.status(201).json({ insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // parcel delete api
  

    app.delete("/api/parcels/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid parcel ID" });
      }

      try {
        const result = await parcelsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Parcel not found" });
        }

        res.status(200).json({ message: "Parcel deleted successfully" });
      } catch (error) {
        console.error("Error deleting parcel:", error);
        res.status(500).json({ message: "Failed to delete parcel" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to parcel World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
