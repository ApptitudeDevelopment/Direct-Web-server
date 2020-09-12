const functions = require('firebase-functions');
const app = require('express')();
const expressHandlebars = require('express-handlebars');
const FBAuth = require('./util/fbAuth');
const stripe = require('stripe')('sk_test_51HHJLwBdInbw5VJ1qsa4GUByv4faeZ5e48HrXlAfjkMfbiw6lEThm8S7ynSvQppyIpeQMNs16xxrUH9X1YFcBBoh00RRZy3USz');
const cors = require('cors');
app.use(cors());

const { db } = require('./util/admin');

const { getAllPosts, makeOnePost, getPost, commentPost, likePost, unlikePost, deletePost } = require('./handlers/posts');
const { signUp, logIn, uploadImage, addUserDetails, getAuthenticatedUser, getUserDetails, markNotificationsRead } = require('./handlers/users');


// Get all posts
app.get('/posts', getAllPosts);
// Submit one post
app.post('/post', FBAuth, makeOnePost);
// View a public post
app.get('/post/:postId', getPost);
// Delete a post
app.delete('/post/:postId', FBAuth, deletePost);
// Like a post
app.get('/post/:postId/like', FBAuth, likePost);
// Unlike a post
app.get('/post/:postId/unlike', FBAuth, unlikePost);
// Comment on a post
app.post('/post/:postId/comment', FBAuth, commentPost);
// Sign up
app.post('/signup', signUp);
// Log in
app.post('/login', logIn);
// User Image
app.post('/user/image', FBAuth, uploadImage);
// Add User details
app.post('/user', FBAuth, addUserDetails);
// Retrieve User
app.get('/user', FBAuth, getAuthenticatedUser);
// Get User details
app.get('/user/:handle', getUserDetails);
// Mark Notifications Read
app.post('/notifications', FBAuth, markNotificationsRead);

app.engine('.hbs', expressHandlebars({ extname: '.hbs' }));
app.set('view engine', '.hbs');
app.set('views', './views');

app.get('/card-wallet', async (req, res) => {
  const intent =  await stripe.setupIntents.create({
    customer: customer.id,
  });
  res.render('card_wallet', { client_secret: intent.client_secret });
});

exports.api = functions.https.onRequest(app);

exports.createNotificationLike = functions.firestore.document('likes/{id}')
    .onCreate((snapshot) => {
        return db.doc(`/posts/${snapshot.data().postId}`).get()
            .then((doc) => {
                if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                    return db.doc(`/notifications/${snapshot.id}`).set({
                        createdAt: new Date().toISOString(),
                        recipient: doc.data().userHandle,
                        sender: snapshot.data().userHandle,
                        type: 'like',
                        read: false,
                        postId: doc.id
                    });
                }
            })
            .catch((err) =>
                console.error(err));
    });

exports.deleteNotificationUnlike = functions.firestore.document('likes/{id}')
    .onDelete((snapshot) => {
        return db.doc(`/notifications/${snapshot.id}`)
            .delete()
            .catch((err) => {
                console.error(err);
                return;
            });
    });

exports.createNotificationComment = functions.firestore.document('comments/{id}')
    .onCreate((snapshot) => {
        return db.doc(`/posts/${snapshot.data().postId}`).get()
            .then((doc) => {
                if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                    return db.doc(`/notifications/${snapshot.id}`).set({
                        createdAt: new Date().toISOString(),
                        recipient: doc.data().userHandle,
                        sender: snapshot.data().userHandle,
                        type: 'comment',
                        read: false,
                        postId: doc.id
                    });
                }
            })
            .catch((err) => {
                console.error(err);
                return;
            });
    });

exports.onUserImageChange = functions.firestore.document('/users/{userId}')
    .onUpdate((change) => {
        console.log(change.before.data());
        console.log(change.after.data());
        if (change.before.data().imageURL !== change.after.data().imageURL) {
            console.log('Image has changed.');
            const batch = db.batch();
            return db.collection('posts').where('userHandle', '==', change.before.data().handle).get()
                .then((data) => {
                    data.forEach((doc) => {
                        const post = db.doc(`/posts/${doc.id}`);
                        batch.update(post, { userImage: change.after.data().imageURL });
                    });
                    return batch.commit();
                });
        } else {
            return true;
        }
    });

exports.onPostDelete = functions
    .firestore.document('/posts/{postId}')
    .onDelete((snapshot, context) => {
        const postId = context.params.postId;
        const batch = db.batch();
        return db
            .collection('comments')
            .where('postId', '==', postId)
            .get()
            .then((data) => {
                data.forEach((doc) => {
                    batch.delete(db.doc(`/comments/${doc.id}`));
                });
                return db
                    .collection('likes')
                    .where('postId', '==', postId)
                    .get();
            })
            .then((data) => {
                data.forEach((doc) => {
                    batch.delete(db.doc(`/likes/${doc.id}`));
                });
                return db
                    .collection('notifications')
                    .where('postId', '==', postId)
                    .get();
            })
            .then((data) => {
                data.forEach((doc) => {
                    batch.delete(db.doc(`/notifications/${doc.id}`));
                });
                return batch.commit();
            })
            .catch((err) => console.error(err));
    });