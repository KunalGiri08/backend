import mongoose, {isValidObjectId} from "mongoose"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const toggleVideoLike = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    if (!req.user?._id) {
        throw new ApiError(401, "Unauthorized");
    }

    const likedAlready = await Like.findOne({
        video: videoId,
        likedBy: req.user._id,
    });

    if (likedAlready) {
        await likedAlready.deleteOne();

        return res.status(200).json(
            new ApiResponse(200, { isLiked: false }, "Video unliked")
        );
    }

    await Like.create({
        video: videoId,
        likedBy: req.user._id,
    });

    return res.status(200).json(
        new ApiResponse(200, { isLiked: true }, "Video liked")
    );
});

const toggleCommentLike = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const userId = req.user?._id;

    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid commentId");
    }

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const likedAlready = await Like.findOne({
        comment: commentId,
        likedBy: userId,
    });

    if (likedAlready) {
        await likedAlready.deleteOne();

        return res.status(200).json(
            new ApiResponse(200, { isLiked: false }, "Comment unliked")
        );
    }

    await Like.create({
        comment: commentId,
        likedBy: userId,
    });

    return res.status(200).json(
        new ApiResponse(200, { isLiked: true }, "Comment liked")
    );
}); 

const toggleTweetLike = asyncHandler(async (req, res) => {
    const {tweetId} = req.params
    //TODO: toggle like on tweet
    const userId = req.user?._id;

    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweetId");
    }
    if(!userId){
        throw new ApiError(401, "Unauthorized");
    }
    const likedAlready = await Like.findOne({
        tweet: tweetId,
        likedBy: userId,
    });
    if (likedAlready) {
        await likedAlready.deleteOne();
        return res.status(200).json(
            new ApiResponse(200, { isLiked: false }, "Tweet unliked")
        );
    }
    await Like.create({
        tweet: tweetId,
        likedBy: userId,
    });

    return res.status(200).json(
        new ApiResponse(200, { isLiked: true }, "Tweet liked")
    );
});

const getLikedVideos = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const likedVideos = await Like.aggregate([
        {
            $match: {
                likedBy: new mongoose.Types.ObjectId(userId),
                video: { $exists: true }
            },
        },
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "likedVideo",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "ownerDetails",
                        },
                    },
                    {
                        $unwind: "$ownerDetails",
                    },
                ],
            },
        },
        {
            $unwind: "$likedVideo",
        },
        {
            $sort: {
                createdAt: -1,
            },
        },
        {
            $project: {
                _id: "$likedVideo._id",
                title: "$likedVideo.title",
                description: "$likedVideo.description",
                views: "$likedVideo.views",
                duration: "$likedVideo.duration",
                createdAt: "$likedVideo.createdAt",
                "videoFile.url": "$likedVideo.videoFile.url",
                "thumbnail.url": "$likedVideo.thumbnail.url",
                owner: {
                    username: "$likedVideo.ownerDetails.username",
                    fullName: "$likedVideo.ownerDetails.fullName",
                    "avatar.url": "$likedVideo.ownerDetails.avatar.url",
                },
            },
        },
    ]);

    return res.status(200).json(
        new ApiResponse(200, likedVideos, "liked videos fetched successfully")
    );
});

export {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos
}