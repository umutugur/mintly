import mongoose from 'mongoose';
let activeUri = null;
export async function connectMongo(uri) {
    const state = mongoose.connection.readyState;
    if (state === 1 && activeUri === uri) {
        return;
    }
    if (state !== 0) {
        await mongoose.disconnect();
    }
    await mongoose.connect(uri, {
        autoIndex: true,
    });
    activeUri = uri;
}
export async function disconnectMongo() {
    if (mongoose.connection.readyState === 0) {
        return;
    }
    await mongoose.disconnect();
    activeUri = null;
}
