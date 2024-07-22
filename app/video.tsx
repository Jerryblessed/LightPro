import { useState } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import styles from './video.module.css';
import React, { DragEvent, useRef, ChangeEvent } from 'react';
import cx from 'classnames';
import axios from "axios";
import { ethers } from "ethers";
const { isAddress } = ethers.utils;

interface ApiKeysProps {
    setApiKeys: (apiKeys: { key: string, secret: string }) => void;
}

const ApiKeys: React.FC<ApiKeysProps> = ({ setApiKeys }) => {
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');

    const handleSaveApiKeys = () => {
        setApiKeys({ key: apiKey, secret: apiSecret });
    };

    return (
        <div className={styles.centerContainer}>
            <h3 className={styles.title}>Enter API Keys</h3>
            <div className={styles.inputGroup}>
                <label>API Key</label>
                <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                />
            </div>
            <div className={styles.inputGroup}>
                <label>API Secret</label>
                <input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                />
            </div>
            <button className={styles.saveButton} onClick={handleSaveApiKeys}>
                Save
            </button>
        </div>
    );
}

export default function Video() {
    const resolutions = [2160, 1080, 720, 360];
    const workers = ['External Elite Edge Node']; // ['External Elite Edge Node', 'Internal Worker']; -> Internal worker not usable
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

    const fileInputRef = useRef<HTMLInputElement>(null); // for the Drag and drop element

    React.useEffect(() => {
        setSelectedResolutions(resolutions);
    }, []);

    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const files = event.dataTransfer.files;
        if (files && files[0].type.slice(0, 5) == 'video') {
            setVideoFile(files[0]);
        }
    };

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files[0].type.slice(0, 5) == 'video') {
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

    // Set DRM handlers
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

    // Save function checks if upload or video URL is provided and then proceeds with all the necessary API calls
    const handleSaveVideo = () => {
        setErrorMessage('');
        // check if necessary info is set
        if (selectedResolutions.length == 0) {
            setErrorMessage('Select Resolution for video Transcoding');
            return;
        }
        if (videoURL == '') {
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
                    'x-tva-sa-secret': apiKeys.secret
                }
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
                    }
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
            resolutions: selectedResolutions
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
            if (isAddress(collection.address) && collection.network) {
                const network = networks.find(net => net.name === collection.network);
                const chainId = network?.value;

                if (!rules.some(rule => rule.chain_id === chainId && rule.nft_collection === collection.address)) {
                    rules.push({
                        chain_id: chainId,
                        nft_collection: collection.address
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
                    'Content-Type': 'application/json'
                }
            });

            console.log(response.data.body);
            setTranscodingId(response.data.body.videos[0].id);
            setIsUploading(false);
        } catch (error) {
            console.error('Error transcoding video:', error);
            setIsUploading(false);
        }
    };

    return (
        <div className={styles.pageContainer}>
            <h1 className={styles.title}>Theta Video API</h1>
            <div className={styles.inputContainer}>
                <label className={styles.label}>Video URL</label>
                <input
                    className={styles.input}
                    type="text"
                    value={videoURL}
                    onChange={(e) => setVideoURL(e.target.value)}
                    placeholder="Enter video URL"
                />
            </div>
            <div className={styles.fileUploadContainer} onDragOver={handleDragOver} onDrop={handleDrop}>
                <input type="file" accept="video/*" onChange={handleFileChange} ref={fileInputRef} hidden />
                {videoFile ? (
                    <div className={styles.fileInfo}>
                        <span className={styles.fileName}>{videoFile.name}</span>
                        <button className={styles.changeButton} onClick={() => fileInputRef.current?.click()}>Change</button>
                    </div>
                ) : (
                    <button className={styles.uploadButton} onClick={() => fileInputRef.current?.click()}>Drag and drop or click to upload a video</button>
                )}
            </div>
            <div className={styles.inputContainer}>
                <label className={styles.label}>Video Name</label>
                <input
                    className={styles.input}
                    type="text"
                    value={videoName}
                    onChange={(e) => setVideoName(e.target.value)}
                    placeholder="Enter video name"
                />
            </div>
            <div className={styles.inputContainer}>
                <label className={styles.label}>Video Description</label>
                <textarea
                    className={styles.input}
                    value={videoDescription}
                    onChange={(e) => setVideoDescription(e.target.value)}
                    placeholder="Enter video description"
                />
            </div>
            <div className={styles.resolutionsContainer}>
                <label className={styles.label}>Select Resolutions</label>
                <div className={styles.resolutions}>
                    {resolutions.map(resolution => (
                        <button
                            key={resolution}
                            className={cx(styles.resolutionButton, selectedResolutions.includes(resolution) && styles.selectedResolution)}
                            onClick={() => toggleResolution(resolution)}
                        >
                            {resolution}p
                        </button>
                    ))}
                </div>
            </div>
            <div className={styles.inputContainer}>
                <label className={styles.label}>Worker</label>
                <Listbox value={selectedWorker} onChange={setSelectedWorker}>
                    <div className={styles.workerContainer}>
                        <Listbox.Button className={styles.workerButton}>{selectedWorker}</Listbox.Button>
                        <Transition
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                        >
                            <Listbox.Options className={styles.workerOptions}>
                                {workers.map((worker, workerIdx) => (
                                    <Listbox.Option
                                        key={workerIdx}
                                        className={({ active }) =>
                                            `${active ? 'text-amber-900 bg-amber-100' : 'text-gray-900'}
                                            cursor-default select-none relative py-2 pl-10 pr-4`
                                        }
                                        value={worker}
                                    >
                                        {({ selected, active }) => (
                                            <>
                                                <span
                                                    className={`${selected ? 'font-medium' : 'font-normal'
                                                        } block truncate`}
                                                >
                                                    {worker}
                                                </span>
                                                {selected ? (
                                                    <span
                                                        className={`${active ? 'text-amber-600' : 'text-amber-600'
                                                            } absolute inset-y-0 left-0 flex items-center pl-3`}
                                                    >
                                                    </span>
                                                ) : null}
                                            </>
                                        )}
                                    </Listbox.Option>
                                ))}
                            </Listbox.Options>
                        </Transition>
                    </div>
                </Listbox>
            </div>
            <div className={styles.collectionsContainer}>
                <label className={styles.label}>DRM Collections</label>
                {collections.map((collection, index) => (
                    <div key={index} className={styles.collectionRow}>
                        <input
                            className={styles.input}
                            type="text"
                            placeholder="Enter NFT Collection Address"
                            value={collection.address}
                            onChange={(e) => handleAddressChange(index, e.target.value)}
                        />
                        <select
                            className={styles.select}
                            value={collection.network}
                            onChange={(e) => handleNetworkChange(index, e.target.value)}
                        >
                            {networks.map(network => (
                                <option key={network.value} value={network.name}>{network.name}</option>
                            ))}
                        </select>
                        {index > 0 && (
                            <button
                                className={styles.removeButton}
                                onClick={() => handleRemoveCollection(index)}
                            >
                                Remove
                            </button>
                        )}
                    </div>
                ))}
                <button className={styles.addButton} onClick={handleAddCollection}>Add Collection</button>
            </div>
            <div className={styles.inputContainer}>
                <label className={styles.label}>API Keys</label>
                <ApiKeys setApiKeys={setApiKeys} />
            </div>
            {errorMessage && <div className={styles.error}>{errorMessage}</div>}
            <button className={styles.saveButton} onClick={handleSaveVideo}>Save</button>
            {isUploading && <div className={styles.uploading}>Uploading...</div>}
            {transcodingId && <div className={styles.transcodingId}>Transcoding ID: {transcodingId}</div>}
        </div>
    );
}
