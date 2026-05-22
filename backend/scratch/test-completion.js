const mongoose = require('mongoose');
const SubTaskCompletion = require('../models/SubTaskCompletion');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const test = async () => {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const ticketId = '664be872b2a67e1a3c6d0e8f'; // a dummy but valid ObjectId format
        const workerId = '664be872b2a67e1a3c6d0e8f'; // a dummy but valid ObjectId format
        const subTaskId = '0'; // A string index

        console.log('Attempting findOne...');
        let completion = await SubTaskCompletion.findOne({ ticketId, subTaskId, workerId });
        console.log('findOne result:', completion);

        console.log('Attempting create...');
        completion = await SubTaskCompletion.create({
            ticketId,
            subTaskId,
            workerId,
            isCompleted: false,
            status: 'Pending',
            referenceFiles: [
                { url: 'http://test.com/file.jpg', name: 'file.jpg', type: 'image/jpeg', size: 1234 }
            ],
            subdomain: 'test'
        });
        console.log('Created successfully:', completion);

        // Cleanup
        await SubTaskCompletion.deleteOne({ _id: completion._id });
        console.log('Cleaned up!');
        process.exit(0);
    } catch (error) {
        console.error('Error occurred:', error);
        process.exit(1);
    }
};

test();
