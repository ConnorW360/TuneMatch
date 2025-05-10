let collection;
const path = require("path");
const fetch = require("node-fetch");
require("dotenv").config({
    path: path.resolve(__dirname, ".env"),
 });
const databaseName = process.env.MONGO_DB_NAME;
const collectionName = process.env.MONGO_COLLECTION;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGO_CONNECTION_STRING;
const client = new MongoClient(uri, { serverAPI: ServerApiVersion.v1 });
const express = require('express');
const app = express();
  
async function mongoDBConnect() {
    try {
        await client.connect();
        const database = client.db(databaseName);
        collection = database.collection(collectionName);
  
     } catch (e) {
        console.error(e);
        process.exit(1);
     }
}

if (process.argv.length !== 2) {
    console.log("Usage server.js");
    process.exit(1);
}

mongoDBConnect();

app.listen(5000);
process.stdout.write(`Web server started and running at http://localhost:5000\n`);

app.use(express.urlencoded({ extended: true }));

process.stdout.write("Stop to shutdown the server: ");
process.stdin.on('readable', async () => {
	let dataInput = process.stdin.read();
	if (dataInput !== null) {
		const command = dataInput.toString().trim();
		if (command === "stop") {
			process.stdout.write("Shutting down the server"); 
            await client.close();
            process.exit(0);  
        } else {
            process.stdout.write(`Invalid command: ${command}\n`);
            process.stdout.write("Stop to shutdown the server: ");
        }
        process.stdin.resume();
    }
});

async function getSpotifyToken() {
    const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`
        },
        body: "grant_type=client_credentials"
        });
        return (await response.json()).access_token;
}

app.set("view engine", "ejs");
app.set("views", path.resolve(__dirname, "templates"));
app.use(express.static(path.resolve(__dirname, "public")));
const favRouter = express.Router();

app.get("/", (request, response) => {
    response.render("home");
});

app.get("/search", (request, response) => {
    response.render("search");
});

app.get("/match", async (request, response) => {
    const query = (request.query.query || "").trim();
    if (!query) {
        return response.redirect("/search");
    }
    try {
    const token = await getSpotifyToken();
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&market=US&limit=25`;
    const apiResponse = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    const data = await apiResponse.json();
    const songs = (data.tracks?.items || []).map((item) => ({
        id: item.id,
        imageUrl: item.album.images[0]?.url || "",
        title: item.name,
        artist: item.artists[0].name,
        externalUrl: item.external_urls.spotify
    }));

    response.render("match", { songs: songs });
    } catch (error) {
        console.error(error);
        response.status(500).send("Error fetching data from Spotify API");
    }
});

app.post("/match", (request, response) => {
    const query = (request.body.title || "").trim();
    if (!query) {
        return response.redirect("/search");
    }
    response.redirect(`/match?query=${encodeURIComponent(query)}`);
});

app.post("/favorite", async (request, response) => {
    const {id, imageUrl, title, artist, externalUrl} = request.body;
    const found = await collection.findOne({ id: id });

    if (found) {
        return response.send(`<script>alert("${title} by ${artist} is already in your favorites!");
            window.history.back();</script>`);
    } 

    await collection.insertOne({
        id: id,
        imageUrl: imageUrl,
        title: title,
        artist: artist,
        externalUrl: externalUrl
    });
    response.redirect("/favorites");
});

favRouter.get("/", async (request, response) => {
    const favs = await collection.find().toArray();
    response.render("favorites", { favs: favs });
});

favRouter.post("/remove", async (request, response) => {
    try {
        const id = ObjectId.createFromHexString(request.body.id);
        await collection.deleteOne({ _id: id });
    } catch (error) {
        console.error("Failed to delete: ", error);
    }
    response.redirect("/favorites");
});

favRouter.post("/clear", async (request, response) => {
    try {
        await collection.deleteMany({});
    } catch (error) {
        console.error("Failed to delete: ", error);
    }
    response.redirect("/favorites");
});

app.use("/favorites", favRouter);