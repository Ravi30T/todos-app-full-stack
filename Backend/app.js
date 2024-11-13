const express = require('express')
const {ObjectId, MongoClient, ReturnDocument} = require('mongodb')
const cors = require('cors')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const app = express()
app.use(express.json())
app.use(cors())

let client
const initializeDBAndServer = async () => {
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const dbCluster = process.env.DB_CLUSTER;
    const dbName = process.env.DB_NAME;
    const uri = `mongodb+srv://${dbUser}:${dbPassword}@${dbCluster}/${dbName}?retryWrites=true&w=majority`;

    client = new MongoClient(uri)

    try {
        await client.connect()
        console.log('Connected to MongoDB...')

        app.listen(3000, () => {
            console.log('Server Running at port:3000')
        })
    }
    catch(e){
        console.log(`Error Connecting to MongoDB: ${e.message}`)
        process.exit(1)
    }
}

initializeDBAndServer()

// Middleware Function for user verification

const authenticateToken = (request, response, next) => {
    let jwtToken

    const authHeader = request.headers["authorization"]

    if(authHeader !== undefined){
        jwtToken = authHeader.split(" ")[1]
    }
    if(jwtToken === undefined){
        response.status(401)
        response.send({errorMsg: "Invalid JWT Token"})
    }
    else{
        jwt.verify(jwtToken,  process.env.JWT_SECRET, async(error, payload)=> {
            if(error){
                response.status(401)
                response.send({errorMsg: error})
            }
            else{
                request.userId = payload.userId
                next();
            }
        })
    }

}

// API-1 Creating New User Account

app.post('/register', async(request, response) => {
    const collection = client.db(process.env.DB_NAME).collection('users')
    const {username, email, password} = request.body

    const checkUserInDB = await collection.find(
        {email}
    ).toArray();

    if(checkUserInDB.length === 0){
        const hashedPassword = await bcrypt.hash(password, 10)

        if(username !== undefined){
            await collection.insertOne({
                username: username,
                email: email,
                password: hashedPassword
            })
            
            response.status(201)
            response.send('User Registered Successfully')
        }
        else{
            response.status(401)
            response.send({errorMsg: 'Please Enter Valid User Details'})
        }
        
    }
    else{
        response.status(401)
        response.send({errorMsg: "User Already Exists"})
    }
})


// API-2 User Login

app.post('/login', async(request, response) => {
    const {username, password} = request.body
    const collection = client.db(process.env.DB_NAME).collection('users')
  
    const checkUserInDB = await collection.find({username}).toArray()
    console.log(checkUserInDB)
    
    if(checkUserInDB.length === 1){
        const verifyPassword = await bcrypt.compare(password, checkUserInDB[0].password)
        if(verifyPassword){
            const token = jwt.sign({userId: checkUserInDB[0]._id }, 'MY_SECRET_TOKEN')
            // const newToken = jwt.sign({ userId: 1 }, process.env.JWT_SECRET, { expiresIn: '2h' });
            // console.log(newToken)
            response.status(201)
            response.send({jwtToken: token})
        }
        else{
            response.status(401)
            response.send({errorMsg: 'Incorrect Password'})
        }

    }
    else{
        response.status(401)
        response.send({errorMsg: "User Doesn't Exists"})
    }
})


// API-3 Create a New Todo Item

app.post('/todo', authenticateToken, async(request, response) => {
    const {id, taskTitle, status} = request.body

    const findUserId = new ObjectId(request.userId) // It converts userId to Object Id
    const collection = client.db(process.env.DB_NAME).collection('users')
    const todoCollection = client.db(process.env.DB_NAME).collection('tasks')

    try {
        const findUser = await collection.findOne({
            _id: findUserId   
        })
        
        if(findUser) {
            const newTodo = {
                userId: findUserId,
                todoId: id,
                todoTitle: taskTitle,
                status: status
            }
            
            const result = await todoCollection.insertOne(newTodo);
    
            response.status(201).send({message: 'Todo Created Successfully'})
        }
        else{
            response.status(404).send({errorMsg: 'Invalid User'})
        }
    }
    catch(error){
        response.status(500).send({errorMsg: 'Failed to add Todo'})
    }
    
})

// API - 4 Update Todo Details

app.put('/todo/:id', authenticateToken, async(request, response) => {
    const {userId} = request
    const {id} = parseInt(request.params)
    const {taskTitle, status} = request.body
    const todoCollection = client.db(process.env.DB_NAME).collection('tasks')

    try {
        const updateFields = {}

        switch(true){
            case !!taskTitle && !!status:
                updateFields.taskTitle = taskTitle
                updateFields.status = status
                break
            case !!taskTitle:
                updateFields.taskTitle = taskTitle
                break
            case !!status:
                updateFields.status = status
                break
            default:
                return response.status(400).send({errorMsg: "Nothing to Update"})
        }

        const result = await todoCollection.updateOne(
            { taskId: id, userId: new ObjectId(userId) },
            [
                { $set: { taskTitle: taskTitle || "$taskTitle", status: status || "$status" } }
            ]
        );

        if(result.matchedCount === 0){
            return response.status(404).send({errorMsg: "Permission Denied"})
        }

        response.status(200).send({message: "Todo Updated Successfully"})
    }
    catch(error){
        response.status(500).send({errorMsg: "Failed to Update Todo"})
    }
})

// API - 5 Delete a Todo Item

app.delete('/todo/:id', authenticateToken, async(request, response) => {
    const {userId} = request
    const {id}= parseInt(request.params)

    const todoCollection = client.db(process.env.DB_NAME).collection('tasks')

    try {
        const result = await todoCollection.deleteOne({
            taskId: id,
            userId: new ObjectId(userId)
        })

        if(result.deletedCount === 0){
            return response.status(404).send({errorMsg: "Permission Denied"})
        }

        response.status(200).send({message: "Todo deleted successfully"})
    }
    catch(e){
        response.status(500).send({errorMsg: "Failed to delete Todo"})
    }
})

// API-6 Update User Details

app.put('/user', authenticateToken, async (request, response) => {
    const { userId } = request;
    const { username, email, password } = request.body;
    const userCollection = client.db(process.env.DB_NAME).collection('users');
    const updateFields = {};

    try {

        if(username){
            updateFields.username = username
        }
    
        if(email){
            updateFields.email = email
        }
    
        if(password){
            const hashedPassword = await bcrypt.hash(password, 10);
            updateFields.password = hashedPassword;
        }
        
        if (Object.keys(updateFields).length === 0) {
            return response.status(400).send({ errorMsg: "No fields provided to update" });
        }

        const result = await userCollection.updateOne(
            { _id: new ObjectId(userId) },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) {
            return response.status(404).send({ errorMsg: "User not found" });
        }

        response.status(200).send({ message: "User updated successfully" });
    } catch (error) {
        console.error("Update error:", error);
        response.status(500).send({ errorMsg: "Failed to update user data" });
    }
});