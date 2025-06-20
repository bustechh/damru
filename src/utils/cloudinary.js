import cloudinary from 'cloudinary'
import fs from 'fs'

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath, folder) => {
    try{
        if(!localFilePath)return null

        //upload the file on cloudinary
        const result = await cloudinary.v2.uploader.upload(localFilePath, {
            folder,
            resource_type:"auto"
        });
        // file has been uploaded successfully
        console.log("file is uploaded on cloudinary ", result.url)
        fs.unlink(localFilePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('File deleted successfully');
            }
        });
        
        return result
        
    }catch(error){
        console.log("file upload failed ", error)
        fs.unlink(localFilePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('File deleted successfully');
            }
        });
        return null
    }
}


const deleteFromCloudinary = async (url)=>{

    //To extract public_id from URL
    const parts = url.split('/');
    // [
    //     'http:',
    //     '',
    //     'res.cloudinary.com',
    //     '<cloud name>',
    //     'image',
    //     'upload',
    //     '<v1748406840>', // this is version number
    //     '<folder>',
    //     '<folder>',
    //     'file.jpg'
    // ]
    const location = parts.slice(7,10);
    let publicIdWithExtension=""
    location.forEach((part) => {
        publicIdWithExtension += (part+"/")
    });
    const publicId = publicIdWithExtension.split('.')[0];

    cloudinary.v2.uploader.destroy(publicId, {invalidate:true}, (error,result)=>{
        if(error){
            console.error("error deleting image , ", error)
        }else{
            console.log("image deleted successfully", result)
        }
    })

}


export {uploadOnCloudinary, deleteFromCloudinary}

