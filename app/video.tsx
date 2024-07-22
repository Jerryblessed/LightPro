import { useState } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import styles from './video.module.css';
import React, { DragEvent, useRef, ChangeEvent } from 'react';
import cx from 'classnames';
import axios from "axios";
import { ethers } from "ethers";
const { isAddress } = ethers.utils;

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
            setTranscodingId('');
            const errorMessage = videoURL ? 'Invalid video URL. Please fix and then try again.' : 'Error starting Video transcoding';
            setErrorMessage(errorMessage);
            console.error('Error fetching transcoding Video:', error);
        }
    };

    // Called after uploading and transcoding, if the user wants to upload new video -> resets the main page
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

    if (apiKeys.secret == 'srvacc_5qsp988etr3giht8h9kuew9ju' || apiKeys.key == 'kuwsyq0cx2gipaggec1ba2pumzat80qj') {
        return <ApiKeys setApiKeys={setApiKeys}></ApiKeys>;
    }

    // shows the transcoding ID
    if (transcodingId) {
        return (
            <div className={styles.centerContainer}>
                <h3 className={styles.title}>Video transcoding successfully started!</h3>
                <h3 className={styles.subtitle}>Your transcoding ID is:</h3>
                <div className={styles.transcodingId}>{transcodingId}</div>
                <div className={styles.backButton}>
                    <button onClick={() => handleBackToNewVideo('')}>
                        Back to upload another video
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.centerContainer}>
                <h3 className={styles.title}>Theta Edge Video Uploader</h3>
                <p className={styles.subtitle}>Upload or Provide a video URL for transcoding</p>
                <div
                    className={cx(styles.fileDropArea, { [styles.dragOver]: false })}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {videoFile ? (
                        <div>
                            <p>{videoFile.name}</p>
                        </div>
                    ) : (
                        <p>Drag & Drop Video File here or click to upload</p>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                </div>
                <div className={styles.inputGroup}>
                    <label>Video URL</label>
                    <input
                        type="text"
                        value={videoURL}
                        onChange={(e) => setVideoURL(e.target.value)}
                    />
                </div>
                <div className={styles.inputGroup}>
                    <label>Video Name</label>
                    <input
                        type="text"
                        value={videoName}
                        onChange={(e) => setVideoName(e.target.value)}
                    />
                </div>
                <div className={styles.inputGroup}>
                    <label>Video Description</label>
                    <textarea
                        value={videoDescription}
                        onChange={(e) => setVideoDescription(e.target.value)}
                    />
                </div>
                <div className={styles.inputGroup}>
                    <label>Resolutions</label>
                    <div className={styles.resolutions}>
                        {resolutions.map((res) => (
                            <button
                                key={res}
                                className={cx(styles.resolution, {
                                    [styles.selected]: selectedResolutions.includes(res),
                                })}
                                onClick={() => toggleResolution(res)}
                            >
                                {res}p
                            </button>
                        ))}
                    </div>
                </div>
                <div className={styles.inputGroup}>
                    <label>Edge Node Worker</label>
                    <Listbox value={selectedWorker} onChange={setSelectedWorker}>
                        {({ open }) => (
                            <>
                                <Listbox.Button className={styles.listboxButton}>
                                    {selectedWorker}
                                </Listbox.Button>
                                <Transition
                                    show={open}
                                    leave="transition ease-in duration-100"
                                    leaveFrom="opacity-100"
                                    leaveTo="opacity-0"
                                >
                                    <Listbox.Options static className={styles.listboxOptions}>
                                        {workers.map((worker) => (
                                            <Listbox.Option key={worker} value={worker}>
                                                {({ selected }) => (
                                                    <div
                                                        className={cx(styles.listboxOption, {
                                                            [styles.selected]: selected,
                                                        })}
                                                    >
                                                        {worker}
                                                    </div>
                                                )}
                                            </Listbox.Option>
                                        ))}
                                    </Listbox.Options>
                                </Transition>
                            </>
                        )}
                    </Listbox>
                </div>
                <div className={styles.inputGroup}>
                    <label>DRM Collections</label>
                    {collections.map((collection, index) => (
                        <div key={index} className={styles.collection}>
                            <input
                                type="text"
                                placeholder="Collection Address"
                                value={collection.address}
                                onChange={(e) =>
                                    handleAddressChange(index, e.target.value)
                                }
                            />
                            <select
                                value={collection.network}
                                onChange={(e) => handleNetworkChange(index, e.target.value)}
                            >
                                {networks.map((network) => (
                                    <option key={network.value} value={network.name}>
                                        {network.name}
                                    </option>
                                ))}
                            </select>
                            {index !== 0 && (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveCollection(index)}
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    ))}
                    <button type="button" onClick={handleAddCollection}>
                        Add Collection
                    </button>
                </div>
                <div className={styles.errorMessage}>{errorMessage}</div>
                <button className={styles.saveButton} onClick={handleSaveVideo}>
                    {isUploading ? 'Uploading...' : 'Save Video'}
                </button>
            </div>
        </div>
    );
}

const ApiKeys = ({ setApiKeys }) => {
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
};
