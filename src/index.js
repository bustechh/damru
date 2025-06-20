import { connectDB } from "./db/index.js";
import dotenv from 'dotenv';
import { app } from "./app.js";

dotenv.config({
    path:".env"
})


connectDB()
.then(()=>{
    app.on("error", (error)=>{
        console.log("error on app: ",error);
    })    
    app.listen(process.env.PORT || 3000, ()=>{
        console.log("port listening in 3000")
    })
})
.catch((error)=>{
    console.log("error on connection to database : ", error);
})