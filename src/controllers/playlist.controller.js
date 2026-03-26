import mongoose, {isValidObjectId} from "mongoose"
import {Playlist} from "../models/playlist.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

//create playlist
const createPlaylist = asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    if (!name || !description) {
        throw new ApiError(400, "Name and description both are required");
    }

    const playlist = await Playlist.create({
        name,
        description,
        owner: userId,
        videos: [] // optional but recommended
    });

    if (!playlist) {
        throw new ApiError(500, "Failed to create playlist");
    }

    return res
        .status(201)
        .json(
            new ApiResponse(201, playlist, "Playlist created successfully")
        );
});
// get all playlists of a user with total videos and total views
const getUserPlaylists = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid userId");
    }

    const playlists = await Playlist.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "videos",
                foreignField: "_id",
                as: "videos"
            }
        },
        {
            $addFields: {
                totalVideos: {
                    $size: "$videos"
                },
                totalViews: {
                    $sum: "$videos.views"
                }
            }
        },
        {
            $project: {
                _id: 1,
                name: 1,
                description: 1,
                totalVideos: 1,
                totalViews: 1,
                updatedAt: 1
            }
        }
    ]);
    if(!playlists.length) {
        throw new ApiError(404, "No playlists found for this user");
    }

    return res
    .status(200)
    .json(new ApiResponse(200, playlists, "User playlists fetched successfully"));

});
// get playlist by id with videos
const getPlaylistById = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;

    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid PlaylistId");
    }

    const playlistVideos = await Playlist.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(playlistId)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "videos",
                foreignField: "_id",
                as: "videos"
            }
        },
        {
            $addFields: {
                videos: {
                    $filter: {
                        input: "$videos",
                        as: "video",
                        cond: { $eq: ["$$video.isPublished", true] }
                    }
                }
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $addFields: {
                totalVideos: { $size: "$videos" },
                totalViews: {
                    $sum: {
                        $map: {
                            input: "$videos",
                            as: "video",
                            in: "$$video.views"
                        }
                    }
                },
                owner: { $first: "$owner" }
            }
        },
        {
            $project: {
                name: 1,
                description: 1,
                createdAt: 1,
                updatedAt: 1,
                totalVideos: 1,
                totalViews: 1,
                videos: {
                    _id: 1,
                    "videoFile.url": 1,
                    "thumbnail.url": 1,
                    title: 1,
                    description: 1,
                    duration: 1,
                    createdAt: 1,
                    views: 1
                },
                owner: {
                    username: 1,
                    fullName: 1,
                    "avatar.url": 1
                }
            }
        }
    ]);

    if (!playlistVideos.length) {
        throw new ApiError(404, "Playlist not found");
    }

    return res.status(200).json(
        new ApiResponse(200, playlistVideos[0], "Playlist fetched successfully")
    );
});
// add video to playlist
const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params;
    const userId = req.user?._id;

    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid ID");
    }

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }


    const updatedPlaylist = await Playlist.findOneAndUpdate(
        {
            _id: playlistId,
            owner: userId
        },
        {
            $addToSet: {
                videos: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!updatedPlaylist) {
        throw new ApiError(404, "Playlist not found or unauthorized");
    }

    return res.status(200).json(
        new ApiResponse(200, updatedPlaylist, "Video added to playlist successfully")
    );
});
// remove video from playlist
const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params;

    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid ID");
    }

    const userId = req.user?._id;
    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    const updatedPlaylist = await Playlist.findOneAndUpdate(
        {
            _id: playlistId,
            owner: userId
        },
        {
            $pull: {
                videos: videoId
            }
        },
        {
            new: true
        }
    );

    if (!updatedPlaylist) {
        throw new ApiError(404, "Playlist not found or unauthorized");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedPlaylist, "Video removed successfully"));
});
// delete playlist
const deletePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;
    const userId = req.user?._id;

    // 1. Validate
    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlistId");
    }

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    // 2. Atomic delete
    const deletedPlaylist = await Playlist.findOneAndDelete({
        _id: playlistId,
        owner: userId
    });

    // 3. Handle failure
    if (!deletedPlaylist) {
        throw new ApiError(404, "Playlist not found");
    }

    // 4. Response (optimized)
    return res.status(200).json(
        new ApiResponse(
            200,
            { playlistId },
            "Playlist deleted successfully"
        )
    );
});
//  update playlist
const updatePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;
    const { name, description } = req.body;
    const userId = req.user?._id;

    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlistId");
    }

    if (!userId) {
        throw new ApiError(401, "Unauthorized");
    }

    if (!name?.trim() || !description?.trim()) {
        throw new ApiError(400, "Name and description are required");
    }

    const updatedPlaylist = await Playlist.findOneAndUpdate(
        {
            _id: playlistId,
            owner: userId
        },
        {
            $set: {
                name: name.trim(),
                description: description.trim()
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!updatedPlaylist) {
        throw new ApiError(404, "Playlist not found or unauthorized");
    }

    return res.status(200).json(
        new ApiResponse(200, updatedPlaylist, "Playlist updated successfully")
    );
});

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist
}
