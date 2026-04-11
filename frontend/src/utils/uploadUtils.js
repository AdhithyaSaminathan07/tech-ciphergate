import { supabase } from "./supabaseClient";

const uploadUtils = async (file) => {
    if (!file) return alert("Please select a file");

    const filePath = `user-photos/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase
        .storage
        .from('user-photos')
        .upload(filePath, file);

    if (uploadError) {
        console.error("Upload failed:", uploadError.message);
        return;
    }

    const { data } = await supabase
        .storage
        .from('user-photos')
        .getPublicUrl(filePath);

    console.log("Uploaded file URL:", data.publicUrl);
    return data.publicUrl;
};

export default uploadUtils;