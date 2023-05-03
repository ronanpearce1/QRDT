if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}


//CONSTANTS TO REQUIRE SERVER DEPENDENCIES

const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const passport = require('passport')
const flash = require('express-flash')
const session = require('express-session')
const methodOverride = require('method-override')
const port = process.env.PORT || 3000;
const host = '0.0.0.0';


//DATABASE CONNECTION

//const mongoose = require('mongoose')
//mongoose.connect(process.env.DATABASE_URL, { useNewUrlParser: true })
//const db = mongoose.connection
//db.on('error', error => console.error(error))
//db.once('open', () => console.log('Connected to Mongoose'))


//PASSPORT

const initializePassport = require('./passport-config')
initializePassport(
  passport,
  email => users.find(user => user.email === email),
  id => users.find(user => user.id === id)
)


//TEST USER

const users = [{
  id: '1668519999893',
  name: 'Ronan',
  email: 'ronanp34@gmail.com',
  password: '$2b$10$eUNYcFy1UpeRrDWRXMz9Ze82c1fRi2j5VPFZDRWjnEWsdKXHeGcmO',
  adminPassword: '$2b$10$eUNYcFy1UpeRrDWRXMz9Ze82c1fRi2j5VPFZDRWjnEWsdKXHeGcmO'
}]


//VIEW ENGINE

app.use(express.static("public"));
app.set('view-engine', 'ejs')
app.use(express.urlencoded({ extended: false }))
app.use(flash())
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))

//ROUTES
app.get('/', checkAuthenticated, (req, res) => {
  res.render('index.ejs', { name: req.user.name })
})

app.get('/admin', checkAuthenticated, async (req, res) => {
  const blobName = await listAdminBlobsName();
  const blobURL = await listAdminBlobsURL();
  const blobTime = await listAdminBlobsCreationTime();
  res.render('admin.ejs', { name: req.user.name, blobName, blobURL, blobTime })
})

app.get('/login', checkNotAuthenticated, (req, res) => {
  res.render('login.ejs')
})

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}))

app.post('/admin', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/admin',
  failureRedirect: '/login',
  failureFlash: true
}))

app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render('register.ejs')
})

app.post('/register', checkNotAuthenticated, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10)
    users.push({
      id: Date.now().toString(),
      name: req.body.name,
      email: req.body.email,
      password: hashedPassword
    })
    res.redirect('/login')
  } catch {
    console.log("not working")
    res.redirect('/register')
  }
  console.log(users)
})

app.get('/account', checkAuthenticated, async (req, res) => {
  const blobName = await listBlobsName();
  const blobURL = await listBlobsURL();
  const blobTime = await listBlobsCreationTime();
  res.render('account.ejs', { name: req.user.name, user: req.body.name, blobName, blobURL, blobTime })
})

app.get('/info', (req, res) => {
  res.render('info.ejs')
})

app.delete('/logout', (req, res, next) => {
  req.logOut((err) => {
    if (err) {
      return next(err);
    }
    res.redirect('/login');
  });
});


//AUTHENTICATION OF LOGIN

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next()
  }

  res.redirect('/login')
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/')
  }
  next()
}


//STORAGE OF FILES

const { BlobServiceClient } = require('@azure/storage-blob');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads')
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
  }
})

const upload = multer({ storage: storage })
const connectionString = process.env.AZURE_CONNECTION_STRING;
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);


app.post('/upload', upload.single('file'), async (req, res, done) => {
  const containerName = (JSON.stringify(req.body.name)).toLowerCase().replace(/"/g, '');
  console.log(containerName);

  const containerClient = blobServiceClient.getContainerClient(containerName);

  await containerClient.createIfNotExists();

  const blobName = req.file.originalname;
  const blobClient = containerClient.getBlockBlobClient(blobName);
  const filePath = req.file.path;

  await blobClient.uploadFile(filePath);

  fs.unlinkSync(filePath);
  console.log('File uploaded successfully.');
});

app.post('/deleteBlob', async (req, res) => {
  const blobName = req.body.blobName;
  await deleteBlob(blobName);
  console.log(blobName, "Successfuly Deleted")
  res.redirect('/admin');
});

const containerName = ("ronan");
const containerClient = blobServiceClient.getContainerClient(containerName);


async function listBlobsName() {
  await containerClient.createIfNotExists();
  const blobs = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    blobs.push(blob);
  }
  blobs.sort((a, b) => {
    return b.properties.lastModified.valueOf() - a.properties.lastModified.valueOf();
  });
  const blobNames = blobs.map(blob => blob.name);
  return blobNames;
}


async function listBlobsURL() {
  await containerClient.createIfNotExists();
  const blobs = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    const blobClient = containerClient.getBlobClient(blob.name);
    const blobProperties = await blobClient.getProperties();
    const blobURL = blobClient.url;
    blobs.push({
      url: blobURL,
      creationTime: blobProperties.createdOn.valueOf()
    });
  }
  blobs.sort((a, b) => b.creationTime - a.creationTime);
  const blobURLs = blobs.map(blob => blob.url);
  return blobURLs;
}

async function listBlobsCreationTime() {
  await containerClient.createIfNotExists();
  const blobs = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    const properties = await containerClient.getBlobClient(blob.name).getProperties();
    const createdOn = properties.createdOn;
    const nameWithTime = `Uploaded on ${createdOn.toLocaleString()}`;
    blobs.push(nameWithTime);
  }
  return blobs;
}



async function listAdminBlobsName() {
  const blobs = [];
  for await (const container of blobServiceClient.listContainers()) {
    const containerName = (container.name);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    for await (const blob of containerClient.listBlobsFlat()) {
      blobs.push(blob);
    }
    blobs.sort((a, b) => {
      return b.properties.lastModified.valueOf() - a.properties.lastModified.valueOf();
    });

  }
  const blobNames = blobs.map(blob => blob.name);
  return blobNames;
}


async function listAdminBlobsURL() {
  const blobs = [];
  for await (const container of blobServiceClient.listContainers()) {
    const containerName = (container.name);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    for await (const blob of containerClient.listBlobsFlat()) {
      const blobClient = containerClient.getBlobClient(blob.name);
      const blobProperties = await blobClient.getProperties();
      const blobURL = blobClient.url;
      blobs.push({
        url: blobURL,
        creationTime: blobProperties.createdOn.valueOf()
      });
    }

  }
  blobs.sort((a, b) => b.creationTime - a.creationTime);
  const blobURLs = blobs.map(blob => blob.url);
  return blobURLs;
}

async function listAdminBlobsCreationTime() {
  const blobs = [];
  for await (const container of blobServiceClient.listContainers()) {
    const containerName = (container.name);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    for await (const blob of containerClient.listBlobsFlat()) {
      const properties = await containerClient.getBlobClient(blob.name).getProperties();
      const createdOn = properties.createdOn;
      const nameWithTime = `Uploaded on ${createdOn.toLocaleString()}`;
      blobs.push(nameWithTime);
    }

  }
  return blobs;
}
async function deleteBlob(blobName) {
  const blobClient = containerClient.getBlobClient(blobName);
  await blobClient.delete();
}

app.listen(port, host);