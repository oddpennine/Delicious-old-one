// SPDX-License-Identifier: AGPL-3.0-or-later
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_dsp/juce_dsp.h>
#include <array>
#include <cmath>

namespace {
constexpr double tau = 6.28318530717958647692;
struct GroveSound final : juce::SynthesiserSound {
    bool appliesToNote(int) override { return true; }
    bool appliesToChannel(int) override { return true; }
};
struct GroveVoice final : juce::SynthesiserVoice {
    juce::AudioProcessorValueTreeState& state;
    juce::ADSR envelope;
    std::array<double, 3> phases{};
    std::array<float, 28> weights{};
    double frequency = 261.625565, time = 0;
    float velocity = 0, wheel = 1;
    int instrument = 0, partials = 8;
    explicit GroveVoice(juce::AudioProcessorValueTreeState& s) : state(s) {}
    bool canPlaySound(juce::SynthesiserSound* s) override { return dynamic_cast<GroveSound*>(s) != nullptr; }
    void startNote(int note, float vel, juce::SynthesiserSound*, int pitchWheel) override {
        instrument = juce::jlimit(0, 4, int(state.getRawParameterValue("instrument")->load()));
        frequency = juce::MidiMessage::getMidiNoteInHertz(note);
        velocity = vel; phases.fill(0); time = 0;
        pitchWheelMoved(pitchWheel);
        envelope.reset(); envelope.setSampleRate(getSampleRate());
        juce::ADSR::Parameters env;
        env.attack = instrument < 2 ? 0.005f : instrument == 2 ? 0.045f : instrument == 3 ? 0.12f : 0.2f;
        env.decay = instrument < 2 ? (instrument == 0 ? 0.75f : 1.3f) : 0.15f;
        env.sustain = instrument < 2 ? 0.0f : 0.82f;
        env.release = instrument < 2 ? 0.24f : 0.32f;
        envelope.setParameters(env); envelope.noteOn();
        constexpr float lute[] = {1,.5f,.28f,.16f,.1f,.05f};
        constexpr float harp[] = {1,.28f,.38f,.1f,.08f};
        constexpr float recorder[] = {1,.035f,.11f,.012f,.018f};
        constexpr float vielle[] = {1,.34f,.19f,.11f,.065f,.04f,.025f,.014f};
        weights.fill(0); partials = instrument == 4 ? 28 : instrument == 0 ? 6 : instrument == 3 ? 8 : 5;
        float sum = 0;
        for(int h=0; h<partials; ++h) {
            if(instrument==0) weights[size_t(h)]=lute[h];
            else if(instrument==1) weights[size_t(h)]=harp[h];
            else if(instrument==2) weights[size_t(h)]=recorder[h];
            else if(instrument==3) weights[size_t(h)]=vielle[h];
            else {
                const double hz=frequency*(h+1);
                auto formant=[hz](double centre,double width){const double x=(hz-centre)/width;return std::exp(-.5*x*x);};
                weights[size_t(h)]=float((.18+.85*formant(650,190)+.5*formant(1150,240)+.15*formant(2500,350))/(h+1));
            }
            sum+=weights[size_t(h)];
        }
        for(auto& w:weights) w/=juce::jmax(1.f,sum);
    }
    void stopNote(float, bool allowTail) override {
        if(allowTail) envelope.noteOff();
        else { envelope.reset(); clearCurrentNote(); }
    }
    void pitchWheelMoved(int value) override { wheel=float(std::pow(2.0,(value-8192)/8192.0*2.0/12.0)); }
    void controllerMoved(int, int) override {}
    void renderNextBlock(juce::AudioBuffer<float>& output,int start,int count) override {
        if(!isVoiceActive())return;
        const double sr=getSampleRate(), dt=1.0/sr;
        for(int i=0;i<count;++i) {
            const float env=envelope.getNextSample();
            if(!envelope.isActive()){clearCurrentNote();break;}
            double sample=0;
            const int layers=instrument==4?3:1;
            for(int layer=0;layer<layers;++layer) {
                const double detune=layer==1?-.002:layer==2?.002:0;
                const double depth=instrument<2?0:instrument==2?.00065:.0015;
                const double vibrato=depth*juce::jmin(1.0,time/.35)*std::sin(tau*5.0*time+layer*.7);
                const double hz=frequency*wheel*(1.0+detune+vibrato);
                phases[size_t(layer)]=std::fmod(phases[size_t(layer)]+tau*hz*dt,tau);
                for(int h=0;h<partials;++h) {
                    if(hz*(h+1)>sr*.42)break;
                    const double damping=instrument<2?std::exp(-time*h*1.2):1;
                    sample+=weights[size_t(h)]*damping*std::sin(phases[size_t(layer)]*(h+1))/layers;
                }
            }
            const float value=float(sample)*env*velocity*.32f;
            for(int channel=0;channel<output.getNumChannels();++channel) output.addSample(channel,start+i,value);
            time+=dt;
        }
    }
};
}

class GroveProcessor final : public juce::AudioProcessor {
public:
    juce::AudioProcessorValueTreeState parameters;
    juce::MidiKeyboardState keyboard;
    juce::Synthesiser synth;
    juce::dsp::Reverb reverb;
    juce::SmoothedValue<float> master;
    GroveProcessor() : AudioProcessor(BusesProperties().withOutput("Output",juce::AudioChannelSet::stereo(),true)),
        parameters(*this,nullptr,"AncientGrove",makeParameters()) {
        for(int i=0;i<16;++i)synth.addVoice(new GroveVoice(parameters));
        synth.addSound(new GroveSound());
    }
    static juce::AudioProcessorValueTreeState::ParameterLayout makeParameters() {
        juce::AudioProcessorValueTreeState::ParameterLayout layout;
        layout.add(std::make_unique<juce::AudioParameterChoice>(juce::ParameterID{"instrument",1},"Instrument",juce::StringArray{"Lute","Harp","Recorder","Vielle","Choir"},0));
        layout.add(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID{"room",1},"Reverb",juce::NormalisableRange<float>{0.f,.8f,.01f},.25f));
        layout.add(std::make_unique<juce::AudioParameterFloat>(juce::ParameterID{"volume",1},"Volume",juce::NormalisableRange<float>{0.f,1.f,.01f},.65f));
        return layout;
    }
    const juce::String getName() const override {return "Ancient Grove";}
    bool acceptsMidi() const override{return true;}
    bool producesMidi() const override{return false;}
    bool isMidiEffect() const override{return false;}
    double getTailLengthSeconds() const override{return 3.0;}
    int getNumPrograms() override{return 1;}
    int getCurrentProgram() override{return 0;}
    void setCurrentProgram(int) override{}
    const juce::String getProgramName(int) override{return {};}
    void changeProgramName(int,const juce::String&) override{}
    bool isBusesLayoutSupported(const BusesLayout& layout) const override {
        return layout.getMainInputChannelSet().isDisabled() && layout.getMainOutputChannelSet()==juce::AudioChannelSet::stereo();
    }
    void prepareToPlay(double sr,int block) override {
        synth.setCurrentPlaybackSampleRate(sr);synth.allNotesOff(0,false);keyboard.reset();
        reverb.prepare({sr,juce::uint32(juce::jmax(1,block)),2});reverb.reset();
        master.reset(sr,.02);master.setCurrentAndTargetValue(parameters.getRawParameterValue("volume")->load());
    }
    void releaseResources() override {synth.allNotesOff(0,false);keyboard.reset();reverb.reset();}
    void reset() override {synth.allNotesOff(0,false);keyboard.reset();reverb.reset();}
    void processBlock(juce::AudioBuffer<float>& audio,juce::MidiBuffer& midi) override {
        juce::ScopedNoDenormals noDenormals;audio.clear();
        keyboard.processNextMidiBuffer(midi,0,audio.getNumSamples(),true);
        synth.renderNextBlock(audio,midi,0,audio.getNumSamples());
        juce::dsp::Reverb::Parameters room;
        room.roomSize=.65f;room.damping=.6f;room.wetLevel=parameters.getRawParameterValue("room")->load();
        room.dryLevel=1.f;room.width=.85f;room.freezeMode=0.f;reverb.setParameters(room);
        juce::dsp::AudioBlock<float> block(audio);juce::dsp::ProcessContextReplacing<float> context(block);reverb.process(context);
        master.setTargetValue(parameters.getRawParameterValue("volume")->load());
        for(int i=0;i<audio.getNumSamples();++i){const float gain=master.getNextValue();for(int ch=0;ch<audio.getNumChannels();++ch)audio.setSample(ch,i,std::tanh(audio.getSample(ch,i)*gain));}
        midi.clear();
    }
    bool hasEditor() const override{return true;}
    juce::AudioProcessorEditor* createEditor() override;
    void getStateInformation(juce::MemoryBlock& dest) override {
        const auto state=parameters.copyState();if(auto xml=state.createXml())copyXmlToBinary(*xml,dest);
    }
    void setStateInformation(const void* data,int bytes) override {
        if(auto xml=getXmlFromBinary(data,bytes))if(xml->hasTagName(parameters.state.getType()))parameters.replaceState(juce::ValueTree::fromXml(*xml));
    }
};

class GroveEditor final : public juce::AudioProcessorEditor {
    GroveProcessor& processor;
    juce::ComboBox instrument;
    juce::Slider room,volume;
    juce::Label title,subtitle,instrumentLabel,roomLabel,volumeLabel;
    juce::MidiKeyboardComponent piano;
    std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment> instrumentAttachment;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> roomAttachment,volumeAttachment;
public:
    explicit GroveEditor(GroveProcessor& p) : AudioProcessorEditor(p),processor(p),piano(p.keyboard,juce::MidiKeyboardComponent::horizontalKeyboard) {
        setSize(720,360);
        title.setText("ANCIENT GROVE",juce::dontSendNotification);title.setFont(juce::Font(26.f,juce::Font::bold));
        subtitle.setText("Medieval-inspired instruments | AU v0.1 | Lion Melody",juce::dontSendNotification);
        instrumentLabel.setText("Instrument",juce::dontSendNotification);roomLabel.setText("Reverb",juce::dontSendNotification);volumeLabel.setText("Volume",juce::dontSendNotification);
        for(auto* label:{&title,&subtitle,&instrumentLabel,&roomLabel,&volumeLabel}){addAndMakeVisible(label);label->setColour(juce::Label::textColourId,juce::Colour(0xffd3b77f));}
        instrument.addItemList({"Lute","Harp","Recorder","Vielle","Choir"},1);addAndMakeVisible(instrument);
        for(auto* slider:{&room,&volume}){slider->setSliderStyle(juce::Slider::LinearHorizontal);slider->setTextBoxStyle(juce::Slider::TextBoxRight,false,50,22);slider->setColour(juce::Slider::thumbColourId,juce::Colour(0xffd3b77f));addAndMakeVisible(slider);}
        addAndMakeVisible(piano);piano.setAvailableRange(36,96);piano.setLowestVisibleKey(48);piano.setKeyWidth(36);
        instrumentAttachment=std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment>(p.parameters,"instrument",instrument);
        roomAttachment=std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(p.parameters,"room",room);
        volumeAttachment=std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(p.parameters,"volume",volume);
    }
    void paint(juce::Graphics& g) override {g.fillAll(juce::Colour(0xff15221a));}
    void resized() override {
        title.setBounds(24,16,670,36);subtitle.setBounds(24,53,670,24);
        instrumentLabel.setBounds(24,90,170,22);instrument.setBounds(24,116,195,32);
        roomLabel.setBounds(245,90,195,22);room.setBounds(240,116,210,32);
        volumeLabel.setBounds(475,90,195,22);volume.setBounds(470,116,225,32);
        piano.setBounds(24,175,getWidth()-48,getHeight()-199);
    }
};
juce::AudioProcessorEditor* GroveProcessor::createEditor(){return new GroveEditor(*this);}
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter(){return new GroveProcessor();}
