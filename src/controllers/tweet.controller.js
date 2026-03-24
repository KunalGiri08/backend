import mongoose, { isValidObjectId } from "mongoose"
import {Tweet} from "../models/tweet.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

// create a new tweet

const createTweet = asyncHandler(async (req, res) => {
    const { content } = req.body;

    // Validate content
    if (!content?.trim()) {
        throw new ApiError(400, "Content is required");
    }

    // Auth check
    if (!req.user) {
        throw new ApiError(401, "Unauthorized");
    }

    // Create tweet
    const tweet = await Tweet.create({
        content: content.trim(),
        owner: req.user._id,
    });

    if (!tweet) {
        throw new ApiError(500, "Failed to create tweet, please try again");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, tweet, "Tweet created successfully"));
});

// get all tweets of a user
const getUserTweets = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid userId");
    }

    const tweets = await Tweet.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId),
            },
        },
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
                            "avatar.url": 1,
                        },
                    },
                ],
            },
        },
        {
            $lookup: {
                from: "likes",
                localField: "_id",
                foreignField: "tweet",
                as: "likeDetails",
                pipeline: [
                    {
                        $project: {
                            likedBy: 1,
                        },
                    },
                ],
            },
        },
        {
            $addFields: {
                likesCount: {
                    $size: "$likeDetails",
                },
                ownerDetails: {
                    $first: "$ownerDetails",
                },
                isLiked: {
                    $cond: {
                        if: {$in: [req.user?._id, "$likeDetails.likedBy"]},
                        then: true,
                        else: false
                    }
                }
            },
        },
        {
            $sort: {
                createdAt: -1
            }
        },
        {
            $project: {
                content: 1,
                ownerDetails: 1,
                likesCount: 1,
                createdAt: 1,
                isLiked: 1
            },
        },
    ]);

    return res
        .status(200)
        .json(new ApiResponse(200, tweets, "Tweets fetched successfully"));
});

const updateTweet = asyncHandler(async (req, res) => {
    const { content } = req.body;
    const { tweetId } = req.params;

    // Validate content
    if (!content?.trim()) {
        throw new ApiError(400, "Content is required");
    }

    // Validate ID
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweetId");
    }

    // Auth check
    if (!req.user) {
        throw new ApiError(401, "Unauthorized");
    }

    // Update with ownership check (single query 🔥)
    const updatedTweet = await Tweet.findOneAndUpdate(
        { _id: tweetId, owner: req.user._id },
        {
            $set: {
                content: content.trim(),
            },
        },
        { new: true }
    );

    if (!updatedTweet) {
        throw new ApiError(403, "Tweet not found or not authorized");
    }

    return res.status(200).json(
        new ApiResponse(200, updatedTweet, "Tweet updated successfully")
    );
});

const deleteTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;

    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweetId");
    }

    if (!req.user) {
        throw new ApiError(401, "Unauthorized");
    }


/**const tweet = await Tweet.findById(tweetId);

    if (!tweet) {
        throw new ApiError(404, "Tweet not found");
    }

    if (tweet?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "only owner can delete thier tweet");
    }

    await Tweet.findByIdAndDelete(tweetId);**/


    const deletedTweet = await Tweet.findOneAndDelete({
        _id: tweetId,
        owner: req.user._id
    });

    if (!deletedTweet) {
        throw new ApiError(404, "Tweet not found or not authorized");
    }

    // 🔥 Delete all likes of this tweet
    await Like.deleteMany({ tweet: tweetId });

    return res.status(200).json(
        new ApiResponse(200, { tweetId }, "Tweet deleted successfully")
    );
});

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}