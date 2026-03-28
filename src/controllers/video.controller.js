import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import {
    uploadOnCloudinary,
    deleteOnCloudinary
} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model.js";

// 
const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

    const pipeline = [];

    // 🔍 Search
    if (query) {
        pipeline.push({
            $search: {
                index: "search-videos",
                text: {
                    query: query,
                    path: ["title", "description"]
                }
            }
        });
    }

    // ✅ Combined match
    const matchStage = { isPublished: true };

    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId");
        }
        matchStage.owner = new mongoose.Types.ObjectId(userId);
    }

    pipeline.push({ $match: matchStage });

    // 🔽 Safe sorting
    const allowedSortFields = ["views", "createdAt", "duration"];

    if (sortBy && allowedSortFields.includes(sortBy)) {
        pipeline.push({
            $sort: {
                [sortBy]: sortType === "asc" ? 1 : -1
            }
        });
    } else {
        pipeline.push({ $sort: { createdAt: -1 } });
    }

    // 👤 Lookup
    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1
                        }
                    }
                ]
            }
        },
        { $unwind: "$ownerDetails" }
    );

    const videoAggregate = Video.aggregate(pipeline);

    const options = {
        page: Math.max(parseInt(page) || 1, 1),
        limit: Math.max(parseInt(limit) || 10, 1)
    };

    const videos = await Video.aggregatePaginate(videoAggregate, options);

    return res
        .status(200)
        .json(new ApiResponse(200, videos, "Videos fetched successfully"));
});
//publish a video
const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;
    
    if ([title, description].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }
   if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized");
}
   const videoFileLocalPath = req.files?.videoFile?.[0]?.path;
   const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

    if (!videoFileLocalPath) {
        throw new ApiError(400, "videoFileLocalPath is required");
    }

    if (!thumbnailLocalPath) {
        throw new ApiError(400, "thumbnailLocalPath is required");
    }

    const videoFile = await uploadOnCloudinary(videoFileLocalPath);
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    if (!videoFile) {
        throw new ApiError(400, "Video file not found");
    }

    if (!thumbnail) {
        throw new ApiError(400, "Thumbnail not found");
    }

    const video = await Video.create({
        title,
        description,
        duration: videoFile.duration,
        videoFile: {
            url: videoFile.url,
            public_id: videoFile.public_id
        },
        thumbnail: {
            url: thumbnail.url,
            public_id: thumbnail.public_id
        },
        owner: req.user?._id,
        isPublished: false
    });


    if (!video) {
        throw new ApiError(500, "videoUpload failed please try again !!!");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, video, "Video uploaded successfully"));
});

//get video details by video id
const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
   
    
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

   if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized");
}

const userObjectId = new mongoose.Types.ObjectId(req.user._id);

const video = await Video.aggregate([
    {
        $match: {
            _id: new mongoose.Types.ObjectId(videoId)
        }
    },
    {
        $lookup: {
            from: "likes",
            localField: "_id",
            foreignField: "video",
            as: "likes"
        }
    },
    {
        $lookup: {
            from: "users",
            localField: "owner",
            foreignField: "_id",
            as: "owner",
            pipeline: [
                {
                    $lookup: {
                        from: "subscriptions",
                        localField: "_id",
                        foreignField: "channel",
                        as: "subscribers"
                    }
                },
                {
                    $addFields: {
                        subscribersCount: { $size: "$subscribers" },
                        isSubscribed: {
                            $in: [userObjectId, "$subscribers.subscriber"]
                        }
                    }
                },
                {
                    $project: {
                        username: 1,
                        "avatar.url": 1,
                        subscribersCount: 1,
                        isSubscribed: 1
                    }
                }
            ]
        }
    },
    {
        $addFields: {
            likesCount: { $size: "$likes" },
            owner: { $first: "$owner" },
            isLiked: {
                $in: [userObjectId, "$likes.likedBy"]
            }
        }
    },
    {
        $project: {
            "videoFile.url": 1,
            "thumbnail.url": 1,
            title: 1,
            description: 1,
            views: 1,
            createdAt: 1,
            duration: 1,
            owner: 1,
            likesCount: 1,
            isLiked: 1
        }
    }
]);

    if (video.length === 0) {
    throw new ApiError(404, "Video not found");
}

    // increment views if video fetched successfully
    await Video.findByIdAndUpdate(videoId, {
        $inc: {
            views: 1
        }
    });

    // add this video to user watch history
    await User.findByIdAndUpdate(req.user?._id, {
        $addToSet: {
            watchHistory: videoId
        }
    });

    return res
        .status(200)
        .json(
            new ApiResponse(200, video[0], "video details fetched successfully")
        );
});
//update video details and thumbnail
const updateVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    if (!req.user?._id) {
        throw new ApiError(401, "Unauthorized");
    }

    if (!title?.trim() || !description?.trim()) {
        throw new ApiError(400, "Title and description cannot be empty");
    }

    const thumbnailLocalPath = req.file?.path;

    let updateFields = {
        title,
        description
    };

    let oldThumbnailId;

    // ✅ get old thumbnail FIRST (fix)
    if (thumbnailLocalPath) {
        const existingVideo = await Video.findById(videoId).select("thumbnail.public_id");
        oldThumbnailId = existingVideo?.thumbnail?.public_id;

        const uploaded = await uploadOnCloudinary(thumbnailLocalPath);

        if (!uploaded) {
            throw new ApiError(500, "Thumbnail upload failed");
        }

        updateFields.thumbnail = {
            public_id: uploaded.public_id,
            url: uploaded.url
        };
    }

    const updatedVideo = await Video.findOneAndUpdate(
        {
            _id: videoId,
            owner: req.user._id
        },
        {
            $set: updateFields
        },
        {
            new: true
        }
    );

    if (!updatedVideo) {
        throw new ApiError(
            404,
            "Video not found or you are not the owner"
        );
    }

    // ✅ now safe delete
    if (thumbnailLocalPath && oldThumbnailId) {
        try {
            await deleteOnCloudinary(oldThumbnailId);
        } catch (error) {
            console.error("Failed to delete old thumbnail");
        }
    }

    return res.status(200).json(
        new ApiResponse(200, updatedVideo, "Video updated successfully")
    );
});
//delete a video
const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    if (!req.user?._id) {
        throw new ApiError(401, "Unauthorized");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "No video found");
    }

    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "Forbidden");
    }

    // delete from cloudinary first
    try {
        await deleteOnCloudinary(video.videoFile.public_id);
        await deleteOnCloudinary(video.thumbnail.public_id);
    } catch (err) {
        console.error("Cloudinary delete failed");
    }

    // delete from DB
    await Video.findByIdAndDelete(videoId);
    await Like.deleteMany({
        video: videoId
    })

     // delete video comments
    await Comment.deleteMany({
        video: videoId,
    })

    return res.status(200).json(
        new ApiResponse(200, null, "Video deleted successfully")
    );
});
// toggle publish/unpublish a video
const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    if (!req.user?._id) {
        throw new ApiError(401, "Unauthorized");
    }

    const updatedVideo = await Video.findOneAndUpdate(
        {
            _id: videoId,
            owner: req.user._id
        },
        [
            {
                $set: {
                    isPublished: { $not: "$isPublished" }
                }
            }
        ],
        { 
            new: true ,
            updatePipeline: true  
        }
    );

    if (!updatedVideo) {
        throw new ApiError(404, "Video not found or unauthorized");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { isPublished: updatedVideo.isPublished },
            "Video publish toggled successfully"
        )
    );
});

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}