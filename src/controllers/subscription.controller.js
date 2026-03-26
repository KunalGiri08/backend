import mongoose, {isValidObjectId} from "mongoose"
import {User} from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const toggleSubscription = asyncHandler(async (req, res) => {
    const { channelId } = req.params;

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channel ID");
    }

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    // prevent self-subscription
    if (channelId.toString() === userId.toString()) {
        throw new ApiError(400, "You cannot subscribe to your own channel");
    }

    const existingSubscription = await Subscription.findOne({
        channel: channelId,
        subscriber: userId
    });

    if (existingSubscription) {
        await existingSubscription.deleteOne();

        return res.status(200).json(
            new ApiResponse(200, { subscribed: false }, "Unsubscribed successfully")
        );
    }

    await Subscription.create({
        channel: channelId,
        subscriber: userId
    });

    return res.status(200).json(
        new ApiResponse(200, { subscribed: true }, "Subscribed successfully")
    );
});

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    let { channelId } = req.params;

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channelId");
    }

    const userId = req.user?._id;

    channelId = new mongoose.Types.ObjectId(channelId);
    const viewerId = userId ? new mongoose.Types.ObjectId(userId) : null;

    const subscribers = await Subscription.aggregate([
        {
            $match: {
                channel: channelId,
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "subscriber",
                foreignField: "_id",
                as: "subscriber",
                pipeline: [
                    {
                        $lookup: {
                            from: "subscriptions",
                            localField: "_id",
                            foreignField: "channel",
                            as: "subscriberSubscriptions",
                        },
                    },
                    {
                        $addFields: {
                            subscribersCount: {
                                $size: "$subscriberSubscriptions",
                            },
                            subscribedToSubscriber: viewerId
                                ? {
                                      $in: [
                                          viewerId,
                                          "$subscriberSubscriptions.subscriber",
                                      ],
                                  }
                                : false,
                        },
                    },
                ],
            },
        },
        {
            $unwind: "$subscriber",
        },
        {
            $project: {
                _id: 0,
                subscriber: {
                    _id: "$subscriber._id",
                    username: "$subscriber.username",
                    fullName: "$subscriber.fullName",
                    avatar: "$subscriber.avatar.url",
                    subscribersCount: "$subscriber.subscribersCount",
                    subscribedToSubscriber:
                        "$subscriber.subscribedToSubscriber",
                },
            },
        },
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            subscribers,
            "Subscribers fetched successfully"
        )
    );
});

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params;

    if (!isValidObjectId(subscriberId)) {
    throw new ApiError(400, "Invalid subscriber ID");
}

const userId = req.user?._id;

if (!userId) {
    throw new ApiError(401, "Unauthorized");
}

if (subscriberId.toString() !== userId.toString()) {
    throw new ApiError(403, "Forbidden");
}
    const subscribedChannels = await Subscription.aggregate([
        {
            $match: {
                subscriber: new mongoose.Types.ObjectId(subscriberId),
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "channel",
                foreignField: "_id",
                as: "subscribedChannel",
                pipeline: [
                    {
                        $lookup: {
                            from: "videos",
                            localField: "_id",
                            foreignField: "owner",
                            as: "videos",
                        },
                    },
                    // ✅ sort videos so $last works correctly
                    {
                        $addFields: {
                            videos: {
                                $sortArray: {
                                    input: "$videos",
                                    sortBy: { createdAt: 1 } // oldest → newest
                                }
                            }
                        }
                    },
                    {
                        $addFields: {
                            latestVideo: {
                                $last: "$videos",
                            },
                        },
                    },
                ],
            },
        },
        {
            $unwind: "$subscribedChannel",
        },
        {
            $project: {
                _id: 0,
                subscribedChannel: {
                    _id: "$subscribedChannel._id",
                    username: "$subscribedChannel.username",
                    fullName: "$subscribedChannel.fullName",
                    avatar: "$subscribedChannel.avatar.url",
                    latestVideo: {
                        _id: "$subscribedChannel.latestVideo._id",
                        videoFile: "$subscribedChannel.latestVideo.videoFile.url",
                        thumbnail: "$subscribedChannel.latestVideo.thumbnail.url",
                        owner: "$subscribedChannel.latestVideo.owner",
                        title: "$subscribedChannel.latestVideo.title",
                        description: "$subscribedChannel.latestVideo.description",
                        duration: "$subscribedChannel.latestVideo.duration",
                        createdAt: "$subscribedChannel.latestVideo.createdAt",
                        views: "$subscribedChannel.latestVideo.views"
                    },
                },
            },
        },
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            subscribedChannels,
            "subscribed channels fetched successfully"
        )
    );
});

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels
}