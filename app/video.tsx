import { useState, useCallback } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import styles from './video.module.css';
import React, { DragEvent, useRef, ChangeEvent } from 'react';
import cx from 'classnames';
import axios from "axios";
import { ethers } from "ethers";

export default function Video() {
    const resolutions = [2160, 1080, 720, 360];
    const workers = ['External Elite Edge Node'];
    const networks = [
        { name: 'Theta Mainnet', value: 361 },
        { name: 'Theta Testnet', value: 365 },
        { name: 'Ethereum Mainnet', value: 1 },
        { name: 'ETH Goerli Testnet', value: 5 },
    ];

    const [videoURL, setVideoURL] = React.useState('');
    const [videoName, setVideoName] = React.useState('');
    const [videoDescription, setVideoDescription] = React.useState('');
    const [selectedResolutions, setSelectedResolutions] = React.useState<number[]>([]);
    const [selectedWorker, setSelectedWorker] = React.useState<string>('External Elite Edge Node');
    const [collections, setCollections] = useState([{ address: '', network: 'Theta Mainnet' }]);
    const [apiKeys, setApiKeys] = React.useState({ key: '', secret: '' });
    const [errorMessage, setErrorMessage] = React.useState('');
    const [videoFile, setVideoFile] = React.useState<File | null>(null);
    const [isUploading, setIsUploading] = React.useState(false);
    const [transcodingId, setTranscodingId] = React.useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        setSelectedResolutions(resolutions);
    }, [resolutions]);

    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const files = event.dataTransfer.files;
        if (files && files[0].type.slice(0, 5) === 'video') {
            setVideoFile(files[0]);
        }
    };

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files[0].type.slice(0, 5) === 'video') {
            console.log(files[0]);
            setVideoFile(files[0]);
        }
    };

    const toggleResolution = (resolution: number) => {
        if (selectedResolutions.includes(resolution)) {
            setSelectedResolutions(prev => prev.filter(res => res !== resolution));
        } else {
            setSelectedResolutions(prev => [...prev, resolution]);
        }
    };

    const removeResolution = (resolution: number) => {
        setSelectedResolutions(prev => prev.filter(res => res !== resolution));
    };

    const handleAddCollection = () => {
        setCollections(prev => [...prev, { address: '', network: 'Theta Mainnet' }]);
    };

    const handleRemoveCollection = (index: number) => {
        setCollections(prev => prev.filter((_, i) => i !== index));
    };

    const handleAddressChange = (index: number, address: string) => {
        const newCollections = [...collections];
        newCollections[index].address = address;
        setCollections(newCollections);
    };

    const handleNetworkChange = (index: number, network: string) => {
        const newCollections = [...collections];
        newCollections[index].network = network;
        setCollections(newCollections);
    };

    const handleSaveVideo = () => {
        setErrorMessage('');
        if (selectedResolutions.length === 0) {
            setErrorMessage('Select Resolution for video Transcoding');
            return;
        }
        if (videoURL === '') {
            if (videoFile != null) {
                uploadVideo();
            } else {
                setErrorMessage('No video URL or video upload provided!');
            }
        } else {
            transcodeVideo(null).catch((e) => {
                setErrorMessage('Invalid video URL. Please fix and then try again.');
            });
        }
    };

    const getSignedURL = async () => {
        try {
            const response = await axios.post('https://api.thetavideoapi.com/upload', {}, {
                headers: {
                    'x-tva-sa-id': apiKeys.key,
                    'x-tva-sa-secret': apiKeys.secret,
                },
            });
            return response.data.body.uploads[0];
        } catch (error) {
            console.error('Error fetching signed URL:', error);
        }
    };

    const uploadVideo = async () => {
        if (videoFile) {
            try {
                setIsUploading(true);
                const uploads = await getSignedURL();
                const signedURL = uploads.presigned_url;

                if (!signedURL) {
                    console.error('Failed to get signed URL.');
                    setErrorMessage('Failed to get signed URL.');
                    return;
                }

                await axios.put(signedURL, videoFile, {
                    headers: {
                        'Content-Type': 'application/octet-stream',
                    },
                });
                transcodeVideo(uploads.id);
            } catch (error) {
                setIsUploading(false);
                console.error('Error uploading the file:', error);
            }
        }
    };

    const createTranscodeData = (id: string | null): any => {
        const baseData = {
            playback_policy: "public",
            resolutions: selectedResolutions,
        };

        if (id) {
            console.log("Transcode via upload id");
            return { ...baseData, source_upload_id: id };
        } else {
            console.log("Transcode via external URL");
            return { ...baseData, source_uri: videoURL };
        }
    };

    const getDrmRules = (): any[] => {
        return collections.reduce((rules: any[], collection) => {
            if (ethers.isAddress(collection.address) && collection.network) {
                const network = networks.find(net => net.name === collection.network);
                const chainId = network?.value;

                if (!rules.some(rule => rule.chain_id === chainId && rule.nft_collection === collection.address)) {
                    rules.push({
                        chain_id: chainId,
                        nft_collection: collection.address,
                    });
                }
            }
            return rules;
        }, []);
    };

    const getMetadata = () => {
        const metadata: any = {};

        if (videoName) metadata.name = videoName;
        if (videoDescription) metadata.description = videoDescription;

        return Object.keys(metadata).length ? metadata : null;
    };

    const transcodeVideo = async (id: string | null) => {
        let data = createTranscodeData(id);

        const drmRules = getDrmRules();
        data.use_drm = drmRules.length > 0;
        if (data.use_drm) data.drm_rules = drmRules;

        const metadata = getMetadata();
        if (metadata) data.metadata = metadata;

        console.log(data);

        try {
            const response = await axios.post('https://api.thetavideoapi.com/video', JSON.stringify(data), {
                headers: {
                    'x-tva-sa-id': apiKeys.key,
                    'x-tva-sa-secret': apiKeys.secret,
                    'Content-Type': 'application/json',
                },
            });

            console.log(response.data.body);
            setTranscodingId(response.data.body.videos[0].id);
            setIsUploading(false);
        } catch (error) {
            setTranscodingId('');
            const errorMessage = videoURL ? 'Invalid video URL. Please fix and then try again.' : 'Error starting Video transcoding';
            setErrorMessage(errorMessage);
            console.error('Error fetching transcoding Video:', error);
        }
    };

    const handleBackToNewVideo = (newValue: string) => {
        setTranscodingId(newValue);
        setVideoFile(null);
        setVideoURL('');
        setVideoDescription('');
        setVideoName('');
        setCollections([{ address: '', network: 'Theta Mainnet' }]);
        setSelectedResolutions(resolutions);
        setSelectedWorker('External Elite Edge Node');
    };

    if (apiKeys.secret === 'srvacc_5qsp988etr3giht8h9kuew9ju' || apiKeys.key === 'kuwsyq0cx2gipaggec1ba2pumzat80qj') {
        return <ApiKeys setApiKeys={setApiKeys} />;
    }

    if (transcodingId !== '') {
        return <Transcoding apiKeys={apiKeys} videoId={transcodingId} setTranscodingId={handleBackToNewVideo} />;
    }

    const fetchVideoProgress = useCallback(() => {
        // Define your fetch logic here
    }, []);

    React.useEffect(() => {
        const interval = setInterval(() => {
            fetchVideoProgress();
        }, 2000);

        setIntervalId(interval);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [fetchVideoProgress, intervalId]);

    return (
        <div className="container mx-auto p-4 max-w-4xl">
            <div className="mt-4">
                <h2 className="text-lg font-medium">Resolutions</h2>
                <div className="flex flex-wrap">
                    {resolutions.map(resolution => (
                        <button
                            key={resolution}
                            className={cx(
                                'py-2 px-4 m-2 rounded',
                                selectedResolutions.includes(resolution) ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700',
                            )}
                            onClick={() => toggleResolution(resolution)}
                        >
                            {resolution}p
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-4">
                <h2 className="text-lg font-medium">Edge Node</h2>
                <Listbox value={selectedWorker} onChange={setSelectedWorker}>
                    <div className="relative">
                        <Listbox.Button className="py-2 px-4 m-2 bg-gray-200 text-gray-700 rounded">
                            {selectedWorker}
                        </Listbox.Button>
                        <Transition
                            as={React.Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                        >
                            <Listbox.Options className="absolute w-full py-1 mt-1 bg-white rounded shadow-lg">
                                {workers.map(worker => (
                                    <Listbox.Option
                                        key={worker}
                                        value={worker}
                                        className={({ active }) =>
                                            `${active ? 'text-blue-900 bg-blue-100' : 'text-gray-900'}
                                            cursor-default select-none relative py-2 pl-10 pr-4`
                                        }
                                    >
                                        {({ selected, active }) => (
                                            <>
                                                <span
                                                    className={`${selected ? 'font-medium' : 'font-normal'} block truncate`}
                                                >
                                                    {worker}
                                                </span>
                                            </>
                                        )}
                                    </Listbox.Option>
                                ))}
                            </Listbox.Options>
                        </Transition>
                    </div>
                </Listbox>
            </div>

            <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="mt-4 border-2 border-dashed border-gray-300 p-4 rounded"
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    accept="video/*"
                />
                <p className="text-center text-gray-500">Drag & drop your video file here, or click to select file</p>
            </div>

            {errorMessage && (
                <div className="mt-4 text-red-500">
                    {errorMessage}
                </div>
            )}

            <div className="mt-4">
                <label className="block text-gray-700">Video URL</label>
                <input
                    type="text"
                    value={videoURL}
                    onChange={(e) => setVideoURL(e.target.value)}
                    className="mt-1 p-2 border rounded w-full"
                />
            </div>

            <div className="mt-4">
                <label className="block text-gray-700">Video Name</label>
                <input
                    type="text"
                    value={videoName}
                    onChange={(e) => setVideoName(e.target.value)}
                    className="mt-1 p-2 border rounded w-full"
                />
            </div>

            <div className="mt-4">
                <label className="block text-gray-700">Video Description</label>
                <textarea
                    value={videoDescription}
                    onChange={(e) => setVideoDescription(e.target.value)}
                    className="mt-1 p-2 border rounded w-full"
                />
            </div>

            <div className="mt-4">
                <h2 className="text-lg font-medium">NFT Collections</h2>
                {collections.map((collection, index) => (
                    <div key={index} className="mt-4">
                        <div className="flex items-center">
                            <input
                                type="text"
                                placeholder="Collection Address"
                                value={collection.address}
                                onChange={(e) => handleAddressChange(index, e.target.value)}
                                className="mt-1 p-2 border rounded w-full"
                            />
                            <select
                                value={collection.network}
                                onChange={(e) => handleNetworkChange(index, e.target.value)}
                                className="mt-1 p-2 border rounded ml-2"
                            >
                                {networks.map((network) => (
                                    <option key={network.value} value={network.name}>
                                        {network.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                className="ml-2 py-2 px-4 bg-red-500 text-white rounded"
                                onClick={() => handleRemoveCollection(index)}
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                ))}
                <button
                    className="mt-4 py-2 px-4 bg-green-500 text-white rounded"
                    onClick={handleAddCollection}
                >
                    Add Collection
                </button>
            </div>

            <div className="mt-4">
                <button
                    className="py-2 px-4 bg-blue-500 text-white rounded"
                    onClick={handleSaveVideo}
                >
                    Save Video
                </button>
            </div>
        </div>
    );
}
