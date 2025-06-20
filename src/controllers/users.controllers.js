import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary.js";
import {User} from '../models/users.models.js'
import cloudinary from 'cloudinary'
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken'

dotenv.config({
    path: ".env"
})
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});



const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        if(!user){
            throw new ApiError(404, "User not found");
        }
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave : false });

        return {accessToken, refreshToken};
    }catch(error){
        throw new ApiError(500, "Something went wrong while generating refresh and access token");
    }
}

const registerUser = asyncHandler(async (req,res)=>{
    const {fullName, email, username, password} = req.body;
    if([fullName, email, username, password].some((field)=> field.trim()==="")){
        throw new ApiError(400,"All fields are required");
    }

    const existedUser = await User.findOne({
        $or : [{username}, {email}],
    });

    if(existedUser){
        throw new ApiError(409, "User with email or username already exists");
    }

    let avatarLocalPath = req.files?.avatar?.[0]?.path;
    let coverImageLocalPath = req.files?.coverImage?.[0]?.path;
 
    let avatar = undefined
    if(avatarLocalPath){
        avatar = await uploadOnCloudinary(coverImageLocalPath, "yourtube/coverImage");
        if(!avatar){
            throw new ApiError(400, "failed to upload cover image to cloudinary");
        }
    }
    
    let coverImage = undefined
    if(coverImageLocalPath){
        coverImage = await uploadOnCloudinary(coverImageLocalPath, "yourtube/coverImage");
        if(!coverImage){
            throw new ApiError(400, "failed to upload cover image to cloudinary");
        }
    }


    const user = await User.create({
        fullName,
        avatar:avatar? avatar.url : undefined,
        coverImage:coverImage? coverImage.url : undefined,
        email,
        password,
        username: username.toLowerCase(),
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if(!createdUser){
        throw new ApiError(500, "something went wrong while registering user");
    }

    return res.status(201).json(new ApiResponse(201, createdUser, "User Registered Successfully"));

});

const loginUser = asyncHandler(async (req,res)=>{
    const {email, username, password} = req.body;
    if(!(username || email)){
        throw new ApiError(400, "Username or Email is required");
    }

    if(!password){
        throw new ApiError(400, "Password is required");
    }

    const user = await User.findOne({
        $or : [{username},{email}]
    });

    if(!user){
        throw new ApiError(402, "User not found");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid Password");
    }


    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id);


    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly : true,
        secure : true,
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user:loggedInUser,
                    accessToken,
                    refreshToken,
                },
                "User logged in Successfully"
            )
        );


});

const logoutUser = asyncHandler( async (req,res)=>{
    await User.findByIdAndUpdate(
        req.user.id,
        {
            $set : {
                refreshToken : undefined
            }
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly : true,
        secure:true
    }
    const logoutmsg = req.user.username + " logged out successfully"
    return res.status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, logoutmsg))

})

const refreshAccessToken = asyncHandler(async (req, res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401, "unauthorised request")
    }

    try {
        const decodedToken =  jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)

        const user = await User.findById(decodedToken?._id)

        if(!user){
            throw new ApiError(401, "invalid refresh token")
        }

        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used")
        }

        const options = {
            httpOnly : true,
            secure : true
        }

        const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)

        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: refreshToken},
                "Access Token refreshed"
            )
        )

    } catch (error) {
        throw new ApiError(401, error?.message || "invalid refresh Token")
    }
})

const changeCurrentPassword = asyncHandler(async (req,res)=>{
    const {oldPassword, newPassword} = req.body
    const user = await User.findById(req.user?._id)    
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid Old Password")
    }

    user.password = newPassword;
    await user.save ({ validateBeforeSave : false})

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password Changed Successfully"))
})

const getCurrentUser = asyncHandler(async (req,res)=>{
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async (req, res)=>{
    const {fullName, email } = req.body

    if(!fullName || !email){
        throw new ApiError(400, "all fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,   //good
                email:email, //good too
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated Successfully"))
})

const updateUserAvatar = asyncHandler( async (req, res)=>{
    const oldAvatarUrl = req.user.avatar
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath, "yourtube/avatar")

    if(!avatar.url){
        throw new ApiError(400, "Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar:avatar.url
            }
        },
        {new : true}
    ).select("-password")

    await deleteFromCloudinary(oldAvatarUrl)

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar updated successfuly" )
    )

})

const updateUserCoverImage = asyncHandler( async (req, res)=>{
    const oldCoverImageUrl = req.user.coverImage
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new ApiError(400, "CoverImage file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath, "yourtube/coverImage")

    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage:coverImage.url
            }
        },
        {new : true}
    ).select("-password")

    await deleteFromCloudinary(oldCoverImageUrl)

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "CoverImage updated successfuly" )
    )

})



export {registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage}
